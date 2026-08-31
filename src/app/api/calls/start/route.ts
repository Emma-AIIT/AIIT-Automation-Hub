/**
 * POST /api/calls/start
 *
 * Starts an outbound calling batch for the Outbound Calls page. Takes a script,
 * a VAPI assistant, a VAPI phone number to dial from, a list of E.164 numbers,
 * and optionally a time to dial at and a number to warm-transfer to.
 *
 * With no scheduledAt the batch dials immediately: the request writes the batch
 * and one row per number, responds, then dials in the background via after().
 * With a scheduledAt in the future the batch is parked as "scheduled" and
 * /api/cron/scheduled-calls picks it up when due.
 *
 * The dialling itself lives in ~/lib/server/dialer so both paths are identical.
 */
import type { NextRequest } from "next/server";
import { NextResponse, after } from "next/server";
import { createAdminClient } from "~/lib/supabase/admin";
import { env } from "~/env";
import { runBatch, MAX_NUMBERS, type Target } from "~/lib/server/dialer";

export const maxDuration = 300;

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
      scheduledAt?: string | null;
      transferNumber?: string | null;
    };

    const script = body.script?.trim();
    const assistantId = body.assistantId?.trim();
    const phoneNumberId = body.phoneNumberId?.trim();
    const numbers = (body.numbers ?? []).map((n) => n.trim()).filter(Boolean);
    const transferNumber = body.transferNumber?.trim() || null;

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
    if (transferNumber && !/^\+\d{8,15}$/.test(transferNumber)) {
      return NextResponse.json({ error: "The transfer number must be in E.164 format" }, { status: 400 });
    }

    // Anything at or before now dials immediately, so a slightly stale clock in
    // the browser cannot park a batch that was meant to go out straight away.
    let scheduledAt: string | null = null;
    if (body.scheduledAt) {
      const when = new Date(body.scheduledAt);
      if (Number.isNaN(when.getTime())) {
        return NextResponse.json({ error: "The scheduled time is not a valid date" }, { status: 400 });
      }
      if (when.getTime() > Date.now() + 60_000) scheduledAt = when.toISOString();
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
        transfer_number: transferNumber,
        scheduled_at: scheduledAt,
        status: scheduledAt ? "scheduled" : "queued",
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

    if (scheduledAt) {
      return NextResponse.json({ success: true, batchId, scheduled: numbers.length, scheduledAt });
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
        transferNumber,
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
