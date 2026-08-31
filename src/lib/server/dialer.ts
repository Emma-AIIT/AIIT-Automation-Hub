/**
 * Outbound campaign dialler.
 *
 * Shared by POST /api/calls/start, /api/cron/scheduled-calls and
 * /api/cron/dial-queue so every path behaves identically.
 *
 * Each call carries a per-call server override pointing at /api/webhooks/vapi.
 * That is deliberate: only campaign calls report their outcome here, and the
 * assistant-level serverUrl feeding Ali's existing Make scenarios is left alone.
 *
 * Dialling is a DRIP, not a burst. VAPI caps concurrent calls per account, and
 * POST /call returns the instant a call is queued rather than when it ends, so
 * firing a whole list at once would stack up hundreds of simultaneous calls and
 * sail straight past that cap. Each pass instead asks VAPI how many calls are
 * live right now across the WHOLE account and tops up to MAX_CONCURRENT_CALLS.
 * Counting from VAPI rather than from our own rows is what keeps Ali's inbound
 * receptionist and any running Make scenario inside the budget too.
 *
 * A pass runs when a batch starts and then every minute from
 * /api/cron/dial-queue, so a long list drains steadily on its own.
 *
 * SERVER-SIDE ONLY.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '~/lib/supabase/admin';
import { env } from '~/env';
import { sendAlertEmail } from '~/lib/server/alerts';

const VAPI_BASE_URL = 'https://api.vapi.ai';

/**
 * Ceiling on calls live at once, across the entire VAPI account.
 * VAPI's limit is 10; 8 leaves two lines free so Ali's inbound agents and any
 * running Make scenario are never starved by a campaign.
 */
export const MAX_CONCURRENT_CALLS = 8;

/**
 * A call dialled longer ago than this with no end-of-call report is assumed
 * finished, so one lost webhook cannot hold a concurrency slot open forever.
 */
const ASSUME_ENDED_AFTER_MINUTES = 30;

/** VAPI call statuses that occupy a concurrency slot. */
const LIVE_STATUSES = new Set(['queued', 'ringing', 'in-progress', 'forwarding']);

/** Per-request ceiling so one hung VAPI request cannot stall a pass. */
const REQUEST_TIMEOUT_MS = 30_000;

export const MAX_NUMBERS = 200;

export type Target = { id: string; phone_number: string };

type Admin = SupabaseClient;

/** The assistant's LLM config, as VAPI returns it on GET /assistant/{id}. */
type VapiModel = Record<string, unknown> & { provider?: string; model?: string; tools?: unknown[] };

type ActiveBatch = {
  id: string;
  status: string;
  script_snapshot: string;
  first_message: string | null;
  assistant_id: string;
  assistant_name: string | null;
  phone_number_id: string;
  transfer_number: string | null;
};

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
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
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
  // authenticate ourselves. Without both the call still goes out, it just never
  // reports back, which the campaign view shows as "awaiting result".
  const serverOverride =
    origin && secret
      ? {
          server: { url: `${origin}/api/webhooks/vapi`, headers: { 'x-vapi-secret': secret } },
          serverMessages: ['end-of-call-report'],
        }
      : {};

  const res = await fetch(`${VAPI_BASE_URL}/call`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
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
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
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
      return `VAPI did not respond within ${REQUEST_TIMEOUT_MS / 1000}s`;
    }
    return reason.message;
  }
  return String(reason);
}

/**
 * How many calls are live on the VAPI account right now.
 *
 * Asks VAPI, not our own tables, so calls started by Ali's inbound agents or by
 * a Make scenario also count against the budget. Falls back to our own
 * bookkeeping if VAPI cannot be reached, erring on the side of thinking more
 * calls are live rather than fewer.
 */
export async function countLiveCalls(apiKey: string, supabase: Admin): Promise<number> {
  const since = new Date(Date.now() - ASSUME_ENDED_AFTER_MINUTES * 60_000).toISOString();

  try {
    const res = await fetch(
      `${VAPI_BASE_URL}/call?limit=100&createdAtGe=${encodeURIComponent(since)}`,
      {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      },
    );
    if (!res.ok) throw new Error(`VAPI returned ${res.status}`);
    const calls = (await res.json()) as Array<{ status?: string }>;
    return calls.filter((c) => LIVE_STATUSES.has(c.status ?? '')).length;
  } catch (err) {
    console.warn('[dialer] could not read live calls from VAPI, using local count:', describeError(err));
    const { count } = await supabase
      .from('outbound_calls')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'dialled')
      .is('outcome', null)
      .gte('dialled_at', since);
    return count ?? 0;
  }
}

/** Recomputes a batch's counters from its rows, so they cannot drift. */
async function refreshCounts(supabase: Admin, batchId: string) {
  const { data } = await supabase.from('outbound_calls').select('status').eq('batch_id', batchId);
  const rows = (data ?? []) as Array<{ status: string }>;
  const dialled = rows.filter((r) => r.status === 'dialled').length;
  const failed = rows.filter((r) => r.status === 'failed').length;
  const remaining = rows.filter((r) => r.status === 'queued').length;

  const update: Record<string, unknown> = { dialled_count: dialled, failed_count: failed };

  // Batch status tracks DIALLING, not outcomes. Outcomes keep arriving by
  // webhook long after the last number has been rung.
  if (remaining === 0) {
    update.status = failed === 0 ? 'completed' : dialled === 0 ? 'failed' : 'partial';
    update.completed_at = new Date().toISOString();
  }

  await supabase.from('outbound_call_batches').update(update).eq('id', batchId);
  return remaining;
}

async function failBatch(supabase: Admin, batch: ActiveBatch, reason: string) {
  await supabase
    .from('outbound_call_batches')
    .update({ status: 'failed', error: reason, completed_at: new Date().toISOString() })
    .eq('id', batch.id);
  await supabase
    .from('outbound_calls')
    .update({ status: 'failed', error: 'Not dialled, the agent could not be prepared', outcome: 'failed' })
    .eq('batch_id', batch.id)
    .eq('status', 'queued');
  await sendAlertEmail(
    `[AIIT Hub] Outbound call batch FAILED before dialling`,
    [
      `A calling batch could not start, so its remaining numbers were not dialled.`,
      ``,
      `Agent: ${batch.assistant_name ?? batch.assistant_id}`,
      `Reason: ${reason}`,
    ].join('\n'),
  );
}

/**
 * One dialling pass: top the account up to MAX_CONCURRENT_CALLS and stop.
 *
 * Safe to call concurrently with itself. The worst case of two overlapping
 * passes is that the second sees the first's calls already live and finds no
 * headroom, which is exactly the behaviour we want.
 */
export async function dialPending(apiKey: string): Promise<{ dialled: number; live: number }> {
  const supabase = createAdminClient();

  const live = await countLiveCalls(apiKey, supabase);
  let headroom = MAX_CONCURRENT_CALLS - live;
  if (headroom <= 0) return { dialled: 0, live };

  const { data: batchRows, error } = await supabase
    .from('outbound_call_batches')
    .select('id, status, script_snapshot, first_message, assistant_id, assistant_name, phone_number_id, transfer_number')
    .in('status', ['queued', 'dialling'])
    .order('created_at', { ascending: true });

  if (error) {
    console.error('[dialer] could not load active batches:', error.message);
    return { dialled: 0, live };
  }

  let dialledNow = 0;

  for (const batch of (batchRows ?? []) as ActiveBatch[]) {
    if (headroom <= 0) break;

    const { data: targetRows } = await supabase
      .from('outbound_calls')
      .select('id, phone_number')
      .eq('batch_id', batch.id)
      .eq('status', 'queued')
      .order('created_at', { ascending: true })
      .limit(headroom);

    const targets = (targetRows ?? []) as Target[];

    // Nothing left to ring: settle the batch and move on.
    if (targets.length === 0) {
      await refreshCounts(supabase, batch.id);
      continue;
    }

    if (batch.status !== 'dialling') {
      await supabase.from('outbound_call_batches').update({ status: 'dialling' }).eq('id', batch.id);
    }

    let modelOverride: VapiModel;
    try {
      modelOverride = await buildModelOverride(apiKey, batch.assistant_id, batch.script_snapshot, batch.transfer_number);
    } catch (err) {
      await failBatch(supabase, batch, err instanceof Error ? err.message : String(err));
      continue;
    }

    const results = await Promise.allSettled(
      targets.map((t) =>
        placeCall({
          apiKey,
          assistantId: batch.assistant_id,
          phoneNumberId: batch.phone_number_id,
          modelOverride,
          firstMessage: batch.first_message,
          number: t.phone_number,
        }),
      ),
    );

    await Promise.all(
      results.map(async (result, i) => {
        const target = targets[i];
        if (!target) return;

        if (result.status === 'fulfilled') {
          dialledNow++;
          headroom--;
          await supabase
            .from('outbound_calls')
            .update({ status: 'dialled', vapi_call_id: result.value, dialled_at: new Date().toISOString() })
            .eq('id', target.id);
        } else {
          // A rejected call never occupied a line, so it does not cost headroom.
          await supabase
            .from('outbound_calls')
            .update({ status: 'failed', error: describeError(result.reason), outcome: 'failed' })
            .eq('id', target.id);
        }
      }),
    );

    await refreshCounts(supabase, batch.id);
  }

  return { dialled: dialledNow, live };
}
