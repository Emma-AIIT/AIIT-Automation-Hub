/**
 * Voice agent call status based on VAPI endedReason.
 * Failed = anything that is NOT customer-ended-call or assistant-ended-call (and similar successful ends).
 * @see https://docs.vapi.ai/calls/call-ended-reason
 */

export type VapiCallLike = { status?: string; endedReason?: string | null };

/** Ended reasons that count as success (not failed). */
const ENDED_REASON_SUCCESS = new Set([
  'customer-ended-call',
  'assistant-ended-call',
  'assistant-ended-call-after-message-spoken',
  'assistant-ended-call-with-hangup-task',
  'assistant-forwarded-call',
  'assistant-said-end-call-phrase',
  'vonage-completed',
]);

/**
 * True if the call should be treated as failed.
 * Failed = anything that is not customer-ended or assistant-ended (success list above).
 */
export function isCallFailed(call: VapiCallLike): boolean {
  const status = call.status ?? '';
  const reason = (call.endedReason ?? '').trim().toLowerCase();

  if (status === 'in-progress' || status === 'queued' || status === 'ringing') {
    return false;
  }

  if (reason && ENDED_REASON_SUCCESS.has(reason)) {
    return false;
  }

  if (reason) {
    return true;
  }

  return status === 'failed' || status === 'busy' || status === 'no-answer';
}

/**
 * Display status for UI and stats: 'completed' | 'ended' | 'failed' | 'in-progress' | etc.
 */
export function getEffectiveCallStatus(call: VapiCallLike): string {
  const status = call.status ?? '';
  const reason = (call.endedReason ?? '').trim().toLowerCase();

  if (status === 'in-progress' || status === 'queued' || status === 'ringing') {
    return status;
  }

  if (reason && ENDED_REASON_SUCCESS.has(reason)) {
    return 'completed';
  }

  if (reason || status === 'failed' || status === 'busy' || status === 'no-answer') {
    return 'failed';
  }

  if (status === 'completed' || status === 'ended') {
    return 'completed';
  }

  return status || 'unknown';
}
