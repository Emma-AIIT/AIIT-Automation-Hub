/**
 * POST /api/calls/start
 *
 * Starts an outbound calling batch for the Outbound Calls page. Takes a script,
 * a VAPI assistant, a VAPI phone number to dial from, and a list of E.164
 * numbers. Writes the batch and one row per number, responds immediately, then
 * places the VAPI calls in the background via next/server after().
 *
 * The script is applied as an assistantOverrides system prompt, so the chosen
 * assistant keeps its configured voice, transcriber and model while saying what
 * Ali wrote. Nothing about the stored assistant is modified.
 *
 * The override is built from the assistant's own model config, fetched once per
 * batch, with only the messages swapped. VAPI's assistantOverrides.model is a
 * discriminated union requiring provider and model on every variant, and it
 * replaces the whole model object, so rebuilding it from scratch would both fail
 * validation and drop any tools or tuning set on the assistant.
 *
 * Dialling runs in bounded parallel batches with a per-request timeout. A batch
 * abandoned mid-dial (function killed, deploy) is swept to "interrupted" by
 * /api/cron/outbound-calls rather than sitting on "dialling" forever.
 */
import type { NextRequest } from "next/server";
import { NextResponse, after } from "next/server";
import { createAdminClient } from "~/lib/supabase/admin";
import { env } from "~/env";
import { sendAlertEmail } from "~/lib/server/alerts";

export const maxDuration = 300;

const VAPI_BASE_URL = "https://api.vapi.ai";

/** Numbers dialled concurrently. VAPI queues each call and returns straight
 *  away, so this is about not hammering the API rather than call pacing. */
const DIAL_CONCURRENCY = 5;

/** Per-request ceiling so one hung VAPI request cannot strand the batch. */
const DIAL_TIMEOUT_MS = 30_000;

/** Hard cap per batch. Guards against a paste going very wrong. */
const MAX_NUMBERS = 200;

type Target = { id: string; phone_number: string };

/** The assistant's LLM config, as VAPI returns it on GET /assistant/{id}. */
type VapiModel = Record<string, unknown> & { provider?: string; model?: string };

/**
 * Builds the model override for a batch.
 *
 * assistantOverrides.model is a discriminated union in the VAPI schema and every
 * variant requires BOTH provider and model, so sending messages on their own is
 * rejected outright. Read the assistant's current model and spread it, replacing
 * only the messages. Spreading rather than rebuilding matters: the override
 * replaces the whole model object, so anything hand-set on the assistant
 * (temperature, maxTokens, tools, toolIds, knowledge base) would be silently
 * dropped for the call if we sent a bare provider/model pair.
 */
async function buildModelOverride(
  apiKey: string,
  assistantId: string,
  script: string,
): Promise<VapiModel> {
  const res = await fetch(`${VAPI_BASE_URL}/assistant/${assistantId}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(DIAL_TIMEOUT_MS),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Could not read the agent's settings from VAPI: ${text || res.status}`);
  }

  const assistant = (await res.json()) as { model?: VapiModel };
  const base = assistant.model;

  if (!base?.provider || !base?.model) {
    throw new Error(
      "This agent has no LLM provider/model set in VAPI, so its script cannot be overridden. Pick a different agent.",
    );
  }

  return { ...base, messages: [{ role: "system", content: script }] };
}

async function placeCall(opts: {
  apiKey: string;
  assistantId: string;
  phoneNumberId: string;
  modelOverride: VapiModel;
  firstMessage: string | null;
  number: string;
}): Promise<string> {
  const { apiKey, assistantId, phoneNumberId, modelOverride, firstMessage, number } = opts;

  const res = await fetch(`${VAPI_BASE_URL}/call`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      assistantId,
      phoneNumberId,
      customer: { number },
      assistantOverrides: {
        model: modelOverride,
        ...(firstMessage ? { firstMessage } : {}),
      },
    }),
    signal: AbortSignal.timeout(DIAL_TIMEOUT_MS),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `VAPI returned ${res.status}`);
  }

  const body = (await res.json()) as { id?: string };
  if (!body.id) throw new Error("VAPI accepted the call but returned no call id");
  return body.id;
}

function describeError(reason: unknown): string {
  if (reason instanceof Error) {
    if (reason.name === "TimeoutError" || reason.name === "AbortError") {
      return `VAPI did not respond within ${DIAL_TIMEOUT_MS / 1000}s`;
    }
    return reason.message;
  }
  return String(reason);
}

async function runBatch(opts: {
  batchId: string;
  apiKey: string;
  assistantId: string;
  assistantName: string | null;
  phoneNumberId: string;
  script: string;
  firstMessage: string | null;
  targets: Target[];
}) {
  const { batchId, apiKey, assistantId, assistantName, phoneNumberId, script, firstMessage, targets } = opts;
  const supabase = createAdminClient();

  await supabase.from("outbound_call_batches").update({ status: "dialling" }).eq("id", batchId);

  // Resolved once per batch, not per call. If the agent cannot be read, fail the
  // whole batch here rather than firing the same broken payload at every number.
  let modelOverride: VapiModel;
  try {
    modelOverride = await buildModelOverride(apiKey, assistantId, script);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await supabase
      .from("outbound_call_batches")
      .update({ status: "failed", error: msg, completed_at: new Date().toISOString() })
      .eq("id", batchId);
    await supabase
      .from("outbound_calls")
      .update({ status: "failed", error: "Not dialled, the agent could not be prepared" })
      .eq("batch_id", batchId);
    await sendAlertEmail(
      `[AIIT Hub] Outbound call batch FAILED before dialling`,
      [
        `A calling batch could not start, so no numbers were dialled.`,
        ``,
        `Agent: ${assistantName ?? assistantId}`,
        `Reason: ${msg}`,
      ].join("\n"),
    );
    return;
  }

  let dialled = 0;
  let failed = 0;
  const errors: string[] = [];

  for (let i = 0; i < targets.length; i += DIAL_CONCURRENCY) {
    const slice = targets.slice(i, i + DIAL_CONCURRENCY);

    const results = await Promise.allSettled(
      slice.map((t) =>
        placeCall({ apiKey, assistantId, phoneNumberId, modelOverride, firstMessage, number: t.phone_number }),
      ),
    );

    await Promise.all(
      results.map(async (result, n) => {
        const target = slice[n];
        if (!target) return;

        if (result.status === "fulfilled") {
          dialled++;
          await supabase
            .from("outbound_calls")
            .update({
              status: "dialled",
              vapi_call_id: result.value,
              dialled_at: new Date().toISOString(),
            })
            .eq("id", target.id);
        } else {
          failed++;
          const msg = describeError(result.reason);
          if (!errors.includes(msg)) errors.push(msg);
          await supabase
            .from("outbound_calls")
            .update({ status: "failed", error: msg })
            .eq("id", target.id);
        }
      }),
    );

    // Publish progress between slices so the page counts up while dialling.
    await supabase
      .from("outbound_call_batches")
      .update({ dialled_count: dialled, failed_count: failed })
      .eq("id", batchId);
  }

  const status = failed === 0 ? "completed" : dialled === 0 ? "failed" : "partial";

  await supabase
    .from("outbound_call_batches")
    .update({
      status,
      dialled_count: dialled,
      failed_count: failed,
      error: errors.length > 0 ? errors.join("; ") : null,
      completed_at: new Date().toISOString(),
    })
    .eq("id", batchId);

  if (failed > 0) {
    await sendAlertEmail(
      `[AIIT Hub] Outbound call batch ${status === "failed" ? "FAILED" : "PARTIALLY FAILED"}`,
      [
        `An outbound calling batch from the dashboard did not fully dial.`,
        ``,
        `Assistant: ${assistantName ?? assistantId}`,
        `Dialled: ${dialled} / ${targets.length} numbers (${failed} failed)`,
        ``,
        `Error from VAPI: ${errors.join("; ") || "unknown"}`,
      ].join("\n"),
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const apiKey = env.VAPI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "VAPI_API_KEY is not configured" }, { status: 400 });
    }

    const body = (await req.json()) as {
      scriptId?: string | null;
      scriptName?: string;
      script?: string;
      firstMessage?: string | null;
      assistantId?: string;
      assistantName?: string | null;
      phoneNumberId?: string;
      fromNumber?: string | null;
      numbers?: string[];
    };

    const script = body.script?.trim();
    const assistantId = body.assistantId?.trim();
    const phoneNumberId = body.phoneNumberId?.trim();
    const numbers = (body.numbers ?? []).map((n) => n.trim()).filter(Boolean);

    if (!script) return NextResponse.json({ error: "A call script is required" }, { status: 400 });
    if (!assistantId) return NextResponse.json({ error: "Choose which agent should make the calls" }, { status: 400 });
    if (!phoneNumberId) return NextResponse.json({ error: "Choose which number to call from" }, { status: 400 });
    if (numbers.length === 0) return NextResponse.json({ error: "Add at least one phone number" }, { status: 400 });
    if (numbers.length > MAX_NUMBERS) {
      return NextResponse.json({ error: `Too many numbers, the limit is ${MAX_NUMBERS} per batch` }, { status: 400 });
    }
    if (numbers.some((n) => !/^\+\d{8,15}$/.test(n))) {
      return NextResponse.json({ error: "Every number must be in E.164 format" }, { status: 400 });
    }

    const supabase = createAdminClient();

    const { data: batch, error: batchError } = await supabase
      .from("outbound_call_batches")
      .insert({
        script_id: body.scriptId ?? null,
        script_name: body.scriptName?.trim() || "Untitled script",
        script_snapshot: script,
        first_message: body.firstMessage?.trim() || null,
        assistant_id: assistantId,
        assistant_name: body.assistantName ?? null,
        phone_number_id: phoneNumberId,
        from_number: body.fromNumber ?? null,
        status: "queued",
        total_count: numbers.length,
      })
      .select("id")
      .single();

    if (batchError || !batch) {
      console.error("[calls/start] batch insert failed:", batchError?.message);
      return NextResponse.json(
        { error: batchError?.message ?? "Could not create the calling batch" },
        { status: 500 },
      );
    }

    const batchId = (batch as { id: string }).id;

    const { data: inserted, error: targetsError } = await supabase
      .from("outbound_calls")
      .insert(numbers.map((phone_number) => ({ batch_id: batchId, phone_number })))
      .select("id, phone_number");

    if (targetsError || !inserted) {
      await supabase
        .from("outbound_call_batches")
        .update({ status: "failed", error: targetsError?.message ?? "Could not record the numbers" })
        .eq("id", batchId);
      return NextResponse.json(
        { error: targetsError?.message ?? "Could not record the numbers" },
        { status: 500 },
      );
    }

    after(() =>
      runBatch({
        batchId,
        apiKey,
        assistantId,
        assistantName: body.assistantName ?? null,
        phoneNumberId,
        script,
        firstMessage: body.firstMessage?.trim() || null,
        targets: inserted as Target[],
      }).catch((err) => {
        console.error("[calls/start] background dialling crashed:", err);
      }),
    );

    return NextResponse.json({ success: true, batchId, queued: numbers.length });
  } catch (error) {
    console.error("[calls/start] error:", error);
    return NextResponse.json({ error: "Failed to start the calls" }, { status: 500 });
  }
}
