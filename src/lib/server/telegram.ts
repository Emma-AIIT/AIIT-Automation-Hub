/**
 * Telegram direct mode: the Hub itself logs in as Ali's own Telegram account
 * (GramJS user client, saved StringSession) instead of going through the
 * messaging bridge. Used for the telegram-ali account when TELEGRAM_API_ID,
 * TELEGRAM_API_HASH and TELEGRAM_SESSION are all set (see getTelegramMode).
 *
 * Vercel functions do not stay alive between requests, so there is no long-lived
 * connection: every operation connects, does its job and destroys the client.
 * At one send per 15 minutes the connect cost (a second or two) does not matter.
 *
 * A fresh session has an empty entity cache, so a chat id alone cannot be sent
 * to. Each send fetches the dialog list once and takes the matching dialog's
 * input peer, which also tells us cleanly when Ali has left the chat. That keeps
 * access hashes out of the database.
 *
 * TELEGRAM_SESSION is a full login to the account. Never log it.
 *
 * SERVER-SIDE ONLY. Loaded with a dynamic import from the routes that need it so
 * GramJS is only pulled in when Telegram direct mode is actually used.
 */
import "server-only";
import { TelegramClient } from "telegram";
import { CustomFile } from "telegram/client/uploads";
import { LogLevel } from "telegram/extensions/Logger";
import { StringSession } from "telegram/sessions";
import { env } from "~/env";
import {
  SESSION_EXPIRED_MESSAGE,
  findDialog,
  isMediaFileName,
  planSends,
  postableGroups,
  telegramErrorMessage,
  withFloodRetry,
} from "~/lib/server/telegram-helpers";
import type { BroadcastFile } from "~/lib/server/whatsapp-broadcast";

/** Ceiling for one whole operation (connect + dialogs + every message). Well under
 *  the routes' function limit, and long enough to sit out one 30s flood wait. */
const OPERATION_TIMEOUT_MS = 60_000;

/** Named "TimeoutError" so the broadcast queue treats it like a Make.com timeout:
 *  the outcome is unknown, so the group is failed rather than re-sent. */
class TelegramTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TimeoutError";
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Connects as Ali's account, runs `fn`, and always destroys the client after, so
 * GramJS's ping/update loop cannot keep the function alive. Errors come out as
 * readable "Telegram: ..." messages.
 */
export async function withTelegram<T>(fn: (client: TelegramClient) => Promise<T>): Promise<T> {
  const { TELEGRAM_API_ID, TELEGRAM_API_HASH, TELEGRAM_SESSION } = env;
  if (!TELEGRAM_API_ID || !TELEGRAM_API_HASH || !TELEGRAM_SESSION) {
    throw new Error("Telegram: direct mode is not set up (TELEGRAM_API_ID, TELEGRAM_API_HASH, TELEGRAM_SESSION)");
  }

  let session: StringSession;
  try {
    session = new StringSession(TELEGRAM_SESSION);
  } catch {
    throw new Error("Telegram: TELEGRAM_SESSION is not a valid session string; run the login script again");
  }

  const client = new TelegramClient(session, TELEGRAM_API_ID, TELEGRAM_API_HASH, {
    connectionRetries: 2,
    autoReconnect: false,
    // Flood waits are handled by withFloodRetry so long ones fail with the wait
    // time instead of silently sleeping past the function limit.
    floodSleepThreshold: 0,
  });
  client.setLogLevel(LogLevel.ERROR);
  // Hub messages are plain text; don't let * or _ turn into formatting.
  client.setParseMode(undefined);

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new TelegramTimeoutError(`Telegram did not respond within ${OPERATION_TIMEOUT_MS / 1000}s`)),
      OPERATION_TIMEOUT_MS,
    );
  });

  const run = async () => {
    try {
      await client.connect();
      if (!(await client.checkAuthorization())) throw new Error(SESSION_EXPIRED_MESSAGE);
      return await fn(client);
    } catch (err) {
      throw new Error(telegramErrorMessage(err));
    }
  };

  try {
    return await Promise.race([run(), timeout]);
  } finally {
    clearTimeout(timer);
    await Promise.race([client.destroy().catch(() => undefined), sleep(5_000)]);
  }
}

/** Every group, supergroup and channel Ali can post in, as `{id, name}` (marked peer ids). */
export async function listTelegramGroups(): Promise<{ id: string; name: string }[]> {
  return withTelegram(async (client) => postableGroups(await withFloodRetry(() => client.getDialogs({}))));
}

/**
 * Sends one broadcast group's messages: text only, or each file as its own
 * message with the caption on the last one (see planSends). Same contract as
 * sendToGroup in whatsapp-broadcast.ts, including `onAttachmentSent` after each
 * file actually goes out. Throws on the first failure.
 */
export async function sendTelegram(opts: {
  chatId: string;
  message: string | null;
  files: BroadcastFile[];
  onAttachmentSent?: () => void | Promise<void>;
}): Promise<void> {
  const { chatId, message, files, onAttachmentSent } = opts;
  if (!/^-?\d+$/.test(chatId)) {
    throw new Error("Telegram: chat id must be a numeric id like -1001234567890; refresh groups");
  }

  const steps = planSends(message, files.length);
  if (steps.length === 0) return;
  // Read the attachments before connecting, so storage time does not count
  // against the Telegram timeout.
  const buffers = await Promise.all(files.map(async (f) => Buffer.from(await f.blob.arrayBuffer())));

  try {
    await withTelegram(async (client) => {
      const dialogs = await withFloodRetry(() => client.getDialogs({}));
      const dialog = findDialog(dialogs, chatId);
      if (!dialog) {
        throw new Error(
          "Telegram: chat not found. Ali's account is no longer in this group (or it was deleted); refresh groups",
        );
      }
      const peer = dialog.inputEntity;

      for (const step of steps) {
        if (step.kind === "text") {
          await withFloodRetry(() => client.sendMessage(peer, { message: step.text }));
          continue;
        }
        const file = files[step.index]!;
        const data = buffers[step.index]!;
        try {
          await withFloodRetry(() =>
            client.sendFile(peer, {
              file: new CustomFile(file.name, data.length, "", data),
              caption: step.caption,
              forceDocument: !isMediaFileName(file.name),
              supportsStreaming: true,
              workers: 4,
            }),
          );
        } catch (err) {
          throw new Error(
            telegramErrorMessage(err) + (files.length > 1 ? ` (attachment ${step.index + 1} of ${files.length})` : ""),
          );
        }
        await onAttachmentSent?.();
      }
    });
  } catch (err) {
    if (err instanceof TelegramTimeoutError) {
      throw new TelegramTimeoutError(
        `${err.message}, so it is unknown whether this group received the message. ` +
          `It was NOT re-sent, to avoid sending twice - check the group before sending again.`,
      );
    }
    throw err;
  }
}
