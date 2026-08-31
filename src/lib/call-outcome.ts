/**
 * Turns VAPI's endedReason into something a person can read.
 *
 * VAPI publishes 627 endedReason values, the overwhelming majority of which are
 * pipeline and provider faults nobody running a campaign cares about. For
 * reporting, all that matters is: did a human pick up and talk, or not, and if
 * not, why. Everything unrecognised falls to "failed" rather than being counted
 * as a pickup, so the pickup rate can never flatter itself.
 */

export type CallOutcome = 'answered' | 'no_answer' | 'voicemail' | 'busy' | 'failed';

/** Reasons that mean a human was on the line and the conversation ran its course. */
const ANSWERED = new Set([
  'customer-ended-call',
  'customer-ended-call-before-warm-transfer',
  'customer-ended-call-after-warm-transfer-attempt',
  'customer-ended-call-during-transfer',
  'assistant-ended-call',
  'assistant-ended-call-with-hangup-task',
  'assistant-ended-call-after-message-spoken',
  'assistant-said-end-call-phrase',
  'assistant-forwarded-call',
  'exceeded-max-duration',
  'vonage-completed',
]);

const NO_ANSWER = new Set([
  'customer-did-not-answer',
  'call.forwarding.no-answer',
  'twilio-reported-customer-misdialed',
  // Connected but nobody ever spoke. Counts as a miss: no conversation happened.
  'silence-timed-out',
  'call.in-progress.error-assistant-did-not-receive-customer-audio',
]);

const BUSY = new Set(['customer-busy', 'call.forwarding.operator-busy']);

const VOICEMAIL = new Set(['voicemail']);

export function classifyOutcome(endedReason: string | null | undefined): CallOutcome {
  const reason = (endedReason ?? '').trim().toLowerCase();
  if (!reason) return 'failed';
  if (ANSWERED.has(reason)) return 'answered';
  if (NO_ANSWER.has(reason)) return 'no_answer';
  if (BUSY.has(reason)) return 'busy';
  if (VOICEMAIL.has(reason)) return 'voicemail';
  return 'failed';
}

/** True when the person actually spoke to the agent. Drives which SMS goes out. */
export function didPickUp(outcome: CallOutcome): boolean {
  return outcome === 'answered';
}

export const OUTCOME_LABELS: Record<CallOutcome, string> = {
  answered: 'Picked up',
  no_answer: 'No answer',
  voicemail: 'Voicemail',
  busy: 'Busy',
  failed: 'Failed',
};
