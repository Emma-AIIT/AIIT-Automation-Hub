/**
 * Twilio SMS sending.
 *
 * Talks to the Twilio REST API directly rather than pulling in the SDK, matching
 * how VAPI is called elsewhere in this app. Requires TWILIO_ACCOUNT_SID,
 * TWILIO_AUTH_TOKEN and TWILIO_FROM_NUMBER.
 *
 * Unlike sendAlertEmail this DOES report failure to the caller, because a
 * follow-up SMS that silently vanished is a lead lost. The caller records the
 * error against the call so it is visible in the campaign view.
 *
 * SERVER-SIDE ONLY.
 */
import { env } from '~/env';

const TWILIO_BASE = 'https://api.twilio.com/2010-04-01';
const SEND_TIMEOUT_MS = 15_000;

export type SmsResult = { sent: true; sid: string } | { sent: false; error: string };

export async function sendSms(to: string, body: string): Promise<SmsResult> {
  const sid = env.TWILIO_ACCOUNT_SID;
  const token = env.TWILIO_AUTH_TOKEN;
  const from = env.TWILIO_FROM_NUMBER;

  if (!sid || !token || !from) {
    const error = 'Twilio is not configured (TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_FROM_NUMBER)';
    console.warn('[twilio]', error);
    return { sent: false, error };
  }

  try {
    const res = await fetch(`${TWILIO_BASE}/Accounts/${sid}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ To: to, From: from, Body: body }),
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      // Twilio returns a JSON body with a human-readable message; surface it.
      let error = text || `Twilio returned ${res.status}`;
      try {
        const parsed = JSON.parse(text) as { message?: string; code?: number };
        if (parsed.message) error = `${parsed.message}${parsed.code ? ` (code ${parsed.code})` : ''}`;
      } catch {
        // keep the raw text
      }
      console.error('[twilio] send failed:', error);
      return { sent: false, error };
    }

    const json = (await res.json()) as { sid?: string };
    return { sent: true, sid: json.sid ?? 'unknown' };
  } catch (err) {
    const error =
      err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')
        ? `Twilio did not respond within ${SEND_TIMEOUT_MS / 1000}s`
        : err instanceof Error
          ? err.message
          : String(err);
    console.error('[twilio] send failed:', error);
    return { sent: false, error };
  }
}
