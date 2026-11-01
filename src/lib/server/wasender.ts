/**
 * WaSender client: sends one WhatsApp message to a phone number.
 * Used by drainBroadcastQueue for the "New numbers" account, so these sends get the
 * same pacing, pause/cancel and history as group broadcasts. SERVER-SIDE ONLY.
 *
 * API: POST /api/send-message with a Bearer key and JSON { to, text?, imageUrl? }.
 * The image must be a public URL, so the caller passes short-lived signed URLs.
 */
import { env } from '~/env';

const SEND_URL = 'https://www.wasenderapi.com/api/send-message';
const SEND_TIMEOUT_MS = 60_000;

/** Added to every message so recipients who never opted in have a way out. */
export const OPT_OUT_LINE = 'Reply STOP to opt out.';

export function withOptOut(message: string | null): string {
  return message ? `${message}\n\n${OPT_OUT_LINE}` : OPT_OUT_LINE;
}

async function post(body: Record<string, string>): Promise<void> {
  let res: Response;
  try {
    res = await fetch(SEND_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.WASENDER_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    });
  } catch (err) {
    if (err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')) {
      const timeout = new Error(
        `WaSender did not respond within ${SEND_TIMEOUT_MS / 1000}s, so it is unknown whether ` +
          `this number received the message. It was NOT re-sent, to avoid sending twice.`,
      );
      timeout.name = 'TimeoutError';
      throw timeout;
    }
    throw err;
  }

  if (!res.ok) {
    const json = (await res.json().catch(() => null)) as { message?: string } | null;
    throw new Error(`WaSender: ${json?.message ?? `HTTP ${res.status}`}`);
  }
}

/**
 * Sends the message to one number. With images, each goes as its own message and the
 * caption rides on the last, matching sendToGroup. Throws on any failure.
 */
export async function sendWasender(opts: {
  to: string;
  message: string | null;
  imageUrls: string[];
  onAttachmentSent?: () => void | Promise<void>;
}): Promise<void> {
  const { to, imageUrls, onAttachmentSent } = opts;
  const text = withOptOut(opts.message);

  if (imageUrls.length === 0) {
    await post({ to, text });
    await onAttachmentSent?.();
    return;
  }

  for (let i = 0; i < imageUrls.length; i++) {
    const isLast = i === imageUrls.length - 1;
    await post({ to, imageUrl: imageUrls[i]!, ...(isLast ? { text } : {}) });
    await onAttachmentSent?.();
  }
}
