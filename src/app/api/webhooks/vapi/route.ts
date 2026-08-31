/**
 * POST /api/webhooks/vapi
 *
 * Receives end-of-call reports for outbound campaign calls. VAPI is pointed here
 * per call, via the assistantOverrides.server override set in the dialler, so
 * only campaign calls arrive. Reports for Ali's other assistants still go
 * wherever their own serverUrl sends them.
 *
 * On each report it:
 *   1. Records the outcome, duration, transcript, summary, recording and cost
 *   2. Texts the person: one message if they picked up, a different one if not
 *   3. Texts the internal number a copy either way
 *   4. Emails a lead summary for calls that were actually answered
 *
 * Authenticated with a shared secret echoed back in the x-vapi-secret header.
 * Unknown call ids are acknowledged with 200 rather than rejected: the report is
 * simply not ours, and retrying it would never help.
 */
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { createAdminClient } from '~/lib/supabase/admin';
import { env } from '~/env';
import { sendSms } from '~/lib/server/twilio';
import { sendAlertEmail } from '~/lib/server/alerts';
import { classifyOutcome, didPickUp, OUTCOME_LABELS, type CallOutcome } from '~/lib/call-outcome';
import { formatAuNumber } from '~/lib/phone';

export const maxDuration = 60;

const DEFAULT_SMS_ANSWERED =
  'Thanks for speaking with us just now. Ali Taufeek from All In IT Solutions will follow up shortly. Reply STOP to opt out.';

const DEFAULT_SMS_NOT_ANSWERED =
  'We just tried to reach you from All In IT Solutions. Give us a call back when it suits, or reply here and we will arrange a time. Reply STOP to opt out.';

type EndOfCallReport = {
  message?: {
    type?: string;
    endedReason?: string;
    startedAt?: string;
    endedAt?: string;
    cost?: number;
    summary?: string;
    transcript?: string;
    recordingUrl?: string;
    call?: { id?: string };
    artifact?: { transcript?: string; recordingUrl?: string; stereoRecordingUrl?: string };
    analysis?: { summary?: string; structuredData?: Record<string, unknown> };
  };
};

function durationSeconds(startedAt?: string, endedAt?: string): number | null {
  if (!startedAt || !endedAt) return null;
  const ms = new Date(endedAt).getTime() - new Date(startedAt).getTime();
  return Number.isFinite(ms) && ms >= 0 ? Math.round(ms / 1000) : null;
}

export async function POST(req: NextRequest) {
  const secret = env.VAPI_WEBHOOK_SECRET;
  if (!secret) {
    console.error('[webhooks/vapi] VAPI_WEBHOOK_SECRET is not set, rejecting report');
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 503 });
  }
  if (req.headers.get('x-vapi-secret') !== secret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let payload: EndOfCallReport;
  try {
    payload = (await req.json()) as EndOfCallReport;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const msg = payload.message;
  if (msg?.type !== 'end-of-call-report') {
    // Some other server message slipped through. Acknowledge and ignore.
    return NextResponse.json({ ok: true, ignored: msg?.type ?? 'unknown' });
  }

  const vapiCallId = msg.call?.id;
  if (!vapiCallId) {
    return NextResponse.json({ error: 'Report has no call id' }, { status: 400 });
  }

  const supabase = createAdminClient();

  const { data: call, error: lookupError } = await supabase
    .from('outbound_calls')
    .select('id, batch_id, phone_number, report_at')
    .eq('vapi_call_id', vapiCallId)
    .maybeSingle();

  if (lookupError) {
    console.error('[webhooks/vapi] lookup failed:', lookupError.message);
    return NextResponse.json({ error: lookupError.message }, { status: 500 });
  }

  // Not one of ours (an inbound call, or another assistant). Nothing to do.
  if (!call) return NextResponse.json({ ok: true, matched: false });

  const row = call as { id: string; batch_id: string; phone_number: string; report_at: string | null };

  // VAPI retries on non-2xx, so a duplicate report must not text anyone twice.
  if (row.report_at) {
    return NextResponse.json({ ok: true, duplicate: true });
  }

  const outcome: CallOutcome = classifyOutcome(msg.endedReason);
  const transcript = msg.artifact?.transcript ?? msg.transcript ?? null;
  const summary = msg.analysis?.summary ?? msg.summary ?? null;
  const recording = msg.artifact?.stereoRecordingUrl ?? msg.artifact?.recordingUrl ?? msg.recordingUrl ?? null;

  await supabase
    .from('outbound_calls')
    .update({
      outcome,
      ended_reason: msg.endedReason ?? null,
      duration_seconds: durationSeconds(msg.startedAt, msg.endedAt),
      started_at: msg.startedAt ?? null,
      ended_at: msg.endedAt ?? null,
      cost: typeof msg.cost === 'number' ? msg.cost : null,
      summary,
      transcript,
      recording_url: recording,
      transferred: msg.endedReason === 'assistant-forwarded-call',
      report_at: new Date().toISOString(),
    })
    .eq('id', row.id);

  // Batch context drives the SMS wording and the summary email.
  const { data: batch } = await supabase
    .from('outbound_call_batches')
    .select('script_name, script_id, assistant_name')
    .eq('id', row.batch_id)
    .single();

  const batchRow = batch as { script_name: string; script_id: string | null; assistant_name: string | null } | null;

  let smsAnswered = DEFAULT_SMS_ANSWERED;
  let smsNotAnswered = DEFAULT_SMS_NOT_ANSWERED;
  if (batchRow?.script_id) {
    const { data: script } = await supabase
      .from('call_scripts')
      .select('sms_answered, sms_not_answered')
      .eq('id', batchRow.script_id)
      .maybeSingle();
    const s = script as { sms_answered: string | null; sms_not_answered: string | null } | null;
    if (s?.sms_answered?.trim()) smsAnswered = s.sms_answered.trim();
    if (s?.sms_not_answered?.trim()) smsNotAnswered = s.sms_not_answered.trim();
  }

  const pickedUp = didPickUp(outcome);
  const body = pickedUp ? smsAnswered : smsNotAnswered;

  const result = await sendSms(row.phone_number, body);
  await supabase
    .from('outbound_calls')
    .update({
      sms_sent_at: result.sent ? new Date().toISOString() : null,
      sms_error: result.sent ? null : result.error,
    })
    .eq('id', row.id);

  // Internal copy, so Ahmed sees every outcome as it happens.
  if (env.OPS_SMS_NUMBER) {
    const mins = durationSeconds(msg.startedAt, msg.endedAt);
    await sendSms(
      env.OPS_SMS_NUMBER,
      [
        `${OUTCOME_LABELS[outcome]}: ${formatAuNumber(row.phone_number)}`,
        batchRow?.script_name ? `Campaign: ${batchRow.script_name}` : null,
        mins !== null ? `Duration: ${mins}s` : null,
        summary ? `Summary: ${summary.slice(0, 300)}` : null,
      ]
        .filter(Boolean)
        .join('\n'),
    );
  }

  // Lead summary email, only for calls a human actually took.
  if (pickedUp) {
    await sendAlertEmail(
      `[Lead] Call answered: ${formatAuNumber(row.phone_number)}${batchRow?.script_name ? ` (${batchRow.script_name})` : ''}`,
      [
        `A campaign call was answered.`,
        ``,
        `Number: ${formatAuNumber(row.phone_number)}`,
        `Campaign: ${batchRow?.script_name ?? 'unknown'}`,
        `Agent: ${batchRow?.assistant_name ?? 'unknown'}`,
        `Duration: ${durationSeconds(msg.startedAt, msg.endedAt) ?? '?'}s`,
        `Ended: ${msg.endedReason ?? 'unknown'}`,
        ``,
        `Summary:`,
        summary ?? '(none provided)',
        ``,
        recording ? `Recording: ${recording}` : '',
        ``,
        `Transcript:`,
        transcript ? transcript.slice(0, 4000) : '(none captured)',
      ].join('\n'),
      env.LEAD_SUMMARY_EMAIL,
    );
  }

  return NextResponse.json({ ok: true, outcome, smsSent: result.sent });
}
