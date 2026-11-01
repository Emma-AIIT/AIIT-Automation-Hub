/**
 * WaSender client for the Exchange HQ account: lists the number's groups and contacts
 * for whatsapp.syncGroups, and sends one recipient's message for drainBroadcastQueue,
 * so these sends get the same pacing, pause/cancel and history as other broadcasts.
 * The API rules and all pure logic are in ~/lib/wasender-chats. SERVER-SIDE ONLY.
 *
 * Images must be public URLs, so the caller passes short-lived signed URLs.
 */
import { env } from '~/env';
import {
  WASENDER_API_BASE,
  buildSendRequests,
  createWasenderGet,
  listChats,
  wasenderErrorMessage,
} from '~/lib/wasender-chats';
import type { WasenderChat } from '~/lib/wasender-chats';

const SEND_TIMEOUT_MS = 60_000;

/** Every group and contact on the connected number. Throws a readable Error. */
export async function listWasenderChats(): Promise<WasenderChat[]> {
  if (!env.WASENDER_API_KEY) throw new Error("Exchange HQ isn't set up yet.");
  return listChats(createWasenderGet(env.WASENDER_API_KEY));
}

async function post(body: Record<string, string>): Promise<void> {
  let res: Response;
  try {
    res = await fetch(`${WASENDER_API_BASE}/api/send-message`, {
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
        `Exchange HQ did not respond within ${SEND_TIMEOUT_MS / 1000}s, so it is unknown whether ` +
          `this chat received the message. It was NOT re-sent, to avoid sending twice.`,
      );
      timeout.name = 'TimeoutError';
      throw timeout;
    }
    throw err;
  }

  if (!res.ok) {
    throw new Error(wasenderErrorMessage(res.status, await res.json().catch(() => null)));
  }
}

/** Sends the message to one group or person. Throws on any failure. */
export async function sendWasender(opts: {
  to: string;
  message: string | null;
  imageUrls: string[];
  onAttachmentSent?: () => void | Promise<void>;
}): Promise<void> {
  const { to, message, imageUrls, onAttachmentSent } = opts;
  for (const body of buildSendRequests({ chatId: to, message, imageUrls })) {
    await post(body);
    await onAttachmentSent?.();
  }
}
