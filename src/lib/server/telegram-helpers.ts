/**
 * Pure Telegram logic for direct mode (src/lib/server/telegram.ts): which chats
 * count as postable, peer id matching, how a send is split into messages, and how
 * GramJS errors read in Broadcast History. Ported from the messaging bridge
 * (services/messaging-bridge/src/telegram.ts) rather than imported across the
 * folder boundary.
 *
 * Only imports the "telegram" package root (no ~/ aliases, no subpaths) so
 * tests/telegram.test.mjs can load it with plain `node --test`.
 */
import { Api, errors, utils } from "telegram";
import type { Entity } from "telegram/define";

/** Telegram rejects media captions longer than this. */
export const CAPTION_LIMIT = 1024;
/** Flood waits up to this long are slept through and retried once; longer ones fail. */
export const MAX_FLOOD_SLEEP_SECONDS = 30;

/** Shown for every error that means TELEGRAM_SESSION no longer logs in. */
export const SESSION_EXPIRED_MESSAGE = "Telegram session expired; run the login script again";

const SESSION_ERRORS = new Set([
  "AUTH_KEY_UNREGISTERED",
  "AUTH_KEY_INVALID",
  "SESSION_REVOKED",
  "SESSION_EXPIRED",
  "USER_DEACTIVATED",
  "USER_DEACTIVATED_BAN",
]);

/** The parts of a GramJS Dialog this file reads, so tests can pass plain objects. */
export type DialogLike = {
  entity?: Entity;
  isGroup: boolean;
  isChannel: boolean;
  title?: string;
};

/**
 * Whether the signed-in user can post into this chat.
 * Basic groups and supergroups: yes unless left, deactivated or muted for members.
 * Broadcast channels: only the creator or admins with the post right.
 */
export function canPost(entity: Entity | undefined): boolean {
  if (entity instanceof Api.Chat) {
    if (entity.left || entity.deactivated || entity.migratedTo) return false;
    return entity.creator || Boolean(entity.adminRights) || !entity.defaultBannedRights?.sendMessages;
  }
  if (entity instanceof Api.Channel) {
    if (entity.left) return false;
    if (entity.broadcast) return Boolean(entity.creator || entity.adminRights?.postMessages);
    if (entity.creator || entity.adminRights) return true;
    return !entity.bannedRights?.sendMessages && !entity.defaultBannedRights?.sendMessages;
  }
  return false;
}

/**
 * Groups, supergroups and channels the account can post in, as whatsapp_groups
 * rows. `id` is the marked peer id (-123 for basic groups, -100123 for
 * supergroups/channels), the same format the bridge returns.
 */
export function postableGroups(dialogs: DialogLike[]): { id: string; name: string }[] {
  return dialogs
    .filter((d) => (d.isGroup || d.isChannel) && canPost(d.entity))
    .map((d) => ({
      id: utils.getPeerId(d.entity!),
      name: d.title?.trim() || "(untitled)",
    }));
}

/** The dialog whose marked peer id is `chatId`, or undefined if the account is not in it. */
export function findDialog<D extends DialogLike>(dialogs: D[], chatId: string): D | undefined {
  return dialogs.find((d) => d.entity && utils.getPeerId(d.entity) === chatId);
}

/** Images and videos go out as media (inline preview); everything else as a document. */
export function isMediaFileName(name: string): boolean {
  return /\.(jpe?g|png|gif|mp4|mov|m4v|webm)$/i.test(name);
}

export type SendStep =
  | { kind: "text"; text: string }
  | { kind: "file"; index: number; caption: string | undefined };

/**
 * The messages one group receives, in order. Mirrors sendToGroup in
 * whatsapp-broadcast.ts: text only, or one message per file with the caption on
 * the last one. A caption over CAPTION_LIMIT cannot ride on the file, so it goes
 * as its own text message straight after the last file.
 */
export function planSends(message: string | null, fileCount: number): SendStep[] {
  const text = message ?? "";
  if (fileCount === 0) return text ? [{ kind: "text", text }] : [];

  const captionFits = text.length <= CAPTION_LIMIT;
  const steps: SendStep[] = [];
  for (let i = 0; i < fileCount; i++) {
    const isLast = i === fileCount - 1;
    steps.push({ kind: "file", index: i, caption: isLast && text && captionFits ? text : undefined });
  }
  if (text && !captionFits) steps.push({ kind: "text", text });
  return steps;
}

/** Short, readable message for anything GramJS throws, e.g. "Telegram: CHAT_WRITE_FORBIDDEN". */
export function telegramErrorMessage(err: unknown): string {
  if (err instanceof errors.FloodWaitError) {
    return `Telegram: rate limited, try again in ${err.seconds}s`;
  }
  if (err instanceof errors.RPCError) {
    if (SESSION_ERRORS.has(err.errorMessage)) return SESSION_EXPIRED_MESSAGE;
    return `Telegram: ${err.errorMessage}`;
  }
  const message = err instanceof Error ? err.message : String(err);
  if (message.startsWith("Telegram")) return message;
  for (const code of SESSION_ERRORS) if (message.includes(code)) return SESSION_EXPIRED_MESSAGE;
  return `Telegram: ${message}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Runs a Telegram call, sleeping through one short flood wait. */
export async function withFloodRetry<T>(
  call: () => Promise<T>,
  wait: (ms: number) => Promise<void> = sleep,
): Promise<T> {
  try {
    return await call();
  } catch (err) {
    if (err instanceof errors.FloodWaitError && err.seconds <= MAX_FLOOD_SLEEP_SECONDS) {
      await wait(err.seconds * 1000);
      return await call();
    }
    throw err;
  }
}
