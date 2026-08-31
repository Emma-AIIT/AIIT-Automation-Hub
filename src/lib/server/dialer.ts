/**
 * Outbound campaign dialler.
 *
 * Shared by POST /api/calls/start (dial now) and /api/cron/scheduled-calls
 * (dial at a set time) so both paths behave identically.
 *
 * Each call carries a per-call server override pointing at /api/webhooks/vapi.
 * That is deliberate: it means only campaign calls report their outcome here,
 * and the assistant-level serverUrl feeding Ali's existing Make scenarios is
 * left completely alone.
 *
 * SERVER-SIDE ONLY.
 */
import { createAdminClient } from '~/lib/supabase/admin';
import { env } from '~/env';
import { sendAlertEmail } from '~/lib/server/alerts';

const VAPI_BASE_URL = 'https://api.vapi.ai';

/** Numbers dialled concurrently. VAPI queues each call and returns straight
 *  away, so this is about not hammering the API rather than call pacing. */
const DIAL_CONCURRENCY = 5;

/** Per-request ceiling so one hung VAPI request cannot strand the batch. */
const DIAL_TIMEOUT_MS = 30_000;

export const MAX_NUMBERS = 200;

export type Target = { id: string; phone_number: string };

/** The assistant's LLM config, as VAPI returns it on GET /assistant/{id}. */
type VapiModel = Record<string, unknown> & { provider?: string; model?: string; tools?: unknown[] };

/**
 * Public origin VAPI should post end-of-call reports to. Explicit env var wins;
 * otherwise Vercel's production URL, which is what production actually serves on.
 * Preview deployments have their own hostnames, so set APP_PUBLIC_URL to test
 * outcomes against a preview.
 */
export function getPublicOrigin(): string | null {
  if (env.APP_PUBLIC_URL) return env.APP_PUBLIC_URL.replace(/\/$/, '');
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  return vercel ? `https://${vercel}` : null;
}

/**
 * Builds the model override for a batch.
 *
 * assistantOverrides.model is a discriminated union and every variant requires
 * BOTH provider and model, so messages alone are rejected. Read the assistant's
 * current model and spread it, replacing only the messages. Spreading rather
 * than rebuilding matters: the override replaces the whole model object, so
 * anything hand-set on the assistant (temperature, maxTokens, tools, knowledge
 * base) would be silently dropped for the call.
 */
export async function buildModelOverride(
  apiKey: string,
  assistantId: string,
  script: string,
  transferNumber: string | null,
): Promise<VapiModel> {
  const res = await fetch(`${VAPI_BASE_URL}/assistant/${assistantId}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(DIAL_TIMEOUT_MS),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Could not read the agent's settings from VAPI: ${text || res.status}`);
  }

  const assistant = (await res.json()) as { model?: VapiModel };
  const base = assistant.model;

  if (!base?.provider || !base?.model) {
    throw new Error(
      'This agent has no LLM provider/model set in VAPI, so its script cannot be overridden. Pick a different agent.',
    );
  }

  const override: VapiModel = { ...base, messages: [{ role: 'system', content: script }] };

  // Warm transfer to Ali. Appended to whatever tools the assistant already has
  // rather than replacing them, so its own tooling keeps working.
  if (transferNumber) {
    const existing = Array.isArray(base.tools) ? [...base.tools] : [];
    existing.push({
      type: 'transferCall',
      destinations: [
        {
          type: 'number',
          number: transferNumber,
          message: 'Great, let me put you through to Ali now. One moment.',
        },
      ],
    });
    override.tools = existing;
  }

  return override;
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

  const origin = getPublicOrigin();
  const secret = env.VAPI_WEBHOOK_SECRET;

  // Only attach the outcome webhook when we can actually be reached and can
  // authenticate ourselves. Without both, the call still goes out, it just will
  // not report back, which the campaign view shows as "awaiting result".
  const serverOverride =
    origin && secret
      ? {
          server: {
            url: `${origin}/api/webhooks/vapi`,
            headers: { 'x-vapi-secret': secret },
          },
          serverMessages: ['end-of-call-report'],
        }
      : {};

  const res = await fetch(`${VAPI_BASE_URL}/call`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      assistantId,
      phoneNumberId,
      customer: { number },
      assistantOverrides: {
        model: modelOverride,
        ...(firstMessage ? { firstMessage } : {}),
        ...serverOverride,
      },
    }),
    signal: AbortSignal.timeout(DIAL_TIMEOUT_MS),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `VAPI returned ${res.status}`);
  }

  const body = (await res.json()) as { id?: string };
  if (!body.id) throw new Error('VAPI accepted the call but returned no call id');
  return body.id;
}

function describeError(reason: unknown): string {
  if (reason instanceof Error) {
    if (reason.name === 'TimeoutError' || reason.name === 'AbortError') {
      return `VAPI did not respond within ${DIAL_TIMEOUT_MS / 1000}s`;
    }
    return reason.message;
  }
  return String(reason);
}

/**
 * Dials every target in a batch and writes the results back.
 * Placing the call is all this does. Whether anyone picked up arrives later,
 * through /api/webhooks/vapi.
 */
export async function runBatch(opts: {
  batchId: string;
  apiKey: string;
  assistantId: string;
  assistantName: string | null;
  phoneNumberId: string;
  script: string;
  firstMessage: string | null;
  transferNumber: string | null;
  targets: Target[];
}) {
  const {
    batchId, apiKey, assistantId, assistantName,
    phoneNumberId, script, firstMessage, transferNumber, targets,
  } = opts;
  const supabase = createAdminClient();

  await supabase.from('outbound_call_batches').update({ status: 'dialling' }).eq('id', batchId);

  // Resolved once per batch, not per call. If the agent cannot be read, fail the
  // whole batch here rather than firing the same broken payload at every number.
  let modelOverride: VapiModel;
  try {
    modelOverride = await buildModelOverride(apiKey, assistantId, script, transferNumber);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await supabase
      .from('outbound_call_batches')
      .update({ status: 'failed', error: msg, completed_at: new Date().toISOString() })
      .eq('id', batchId);
    await supabase
      .from('outbound_calls')
      .update({ status: 'failed', error: 'Not dialled, the agent could not be prepared' })
      .eq('batch_id', batchId);
    await sendAlertEmail(
      `[AIIT Hub] Outbound call batch FAILED before dialling`,
      [
        `A calling batch could not start, so no numbers were dialled.`,
        ``,
        `Agent: ${assistantName ?? assistantId}`,
        `Reason: ${msg}`,
      ].join('\n'),
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

        if (result.status === 'fulfilled') {
          dialled++;
          await supabase
            .from('outbound_calls')
            .update({
              status: 'dialled',
              vapi_call_id: result.value,
              dialled_at: new Date().toISOString(),
            })
            .eq('id', target.id);
        } else {
          failed++;
          const msg = describeError(result.reason);
          if (!errors.includes(msg)) errors.push(msg);
          await supabase
            .from('outbound_calls')
            .update({ status: 'failed', error: msg, outcome: 'failed' })
            .eq('id', target.id);
        }
      }),
    );

    await supabase
      .from('outbound_call_batches')
      .update({ dialled_count: dialled, failed_count: failed })
      .eq('id', batchId);
  }

  const status = failed === 0 ? 'completed' : dialled === 0 ? 'failed' : 'partial';

  await supabase
    .from('outbound_call_batches')
    .update({
      status,
      dialled_count: dialled,
      failed_count: failed,
      error: errors.length > 0 ? errors.join('; ') : null,
      completed_at: new Date().toISOString(),
    })
    .eq('id', batchId);

  if (failed > 0) {
    await sendAlertEmail(
      `[AIIT Hub] Outbound call batch ${status === 'failed' ? 'FAILED' : 'PARTIALLY FAILED'}`,
      [
        `An outbound calling batch from the dashboard did not fully dial.`,
        ``,
        `Agent: ${assistantName ?? assistantId}`,
        `Dialled: ${dialled} / ${targets.length} numbers (${failed} failed)`,
        ``,
        `Error from VAPI: ${errors.join('; ') || 'unknown'}`,
      ].join('\n'),
    );
  }
}
