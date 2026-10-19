import bigInt from "big-integer";
import { Api, TelegramClient, utils } from "telegram";
import { CustomFile } from "telegram/client/uploads";
import { FloodWaitError, RPCError } from "telegram/errors";
import { LogLevel } from "telegram/extensions/Logger";
import { StringSession } from "telegram/sessions";
import type { Entity } from "telegram/define";
import { BridgeError, type Group, type Platform, type SendInput } from "./platform";

export type TelegramConfig = {
  apiId: number;
  apiHash: string;
  session: string;
};

/** Telegram rejects media captions longer than this. */
export const CAPTION_LIMIT = 1024;
/** Flood waits up to this long are slept through and retried once; longer ones go back as 429. */
const MAX_FLOOD_SLEEP_SECONDS = 30;
const WATCHDOG_MS = 60_000;

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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Turns anything GramJS throws into a short message a person can read in the Hub. */
export function toTelegramError(err: unknown): BridgeError {
  if (err instanceof BridgeError) return err;
  if (err instanceof FloodWaitError) {
    return new BridgeError(429, `Telegram: rate limited, try again in ${err.seconds}s`);
  }
  if (err instanceof RPCError) return new BridgeError(502, `Telegram: ${err.errorMessage}`);
  const message = err instanceof Error ? err.message : String(err);
  return new BridgeError(502, `Telegram: ${message}`);
}

/** Runs a Telegram call, sleeping through one short flood wait. */
export async function withFloodRetry<T>(call: () => Promise<T>, wait: (ms: number) => Promise<void> = sleep): Promise<T> {
  try {
    return await call();
  } catch (err) {
    if (err instanceof FloodWaitError && err.seconds <= MAX_FLOOD_SLEEP_SECONDS) {
      await wait(err.seconds * 1000);
      return await call();
    }
    throw err;
  }
}

/**
 * One long-lived GramJS client signed in as a real user account (StringSession).
 * GramJS reconnects on its own; a watchdog covers the case where it gives up.
 */
export class TelegramPlatform implements Platform {
  private readonly client: TelegramClient;
  private watchdog?: NodeJS.Timeout;
  private connecting?: Promise<void>;

  constructor(config: TelegramConfig) {
    this.client = new TelegramClient(new StringSession(config.session), config.apiId, config.apiHash, {
      connectionRetries: 10,
      retryDelay: 5_000,
      autoReconnect: true,
      // We handle flood waits ourselves so long ones become a readable 429 instead of a silent hang.
      floodSleepThreshold: 0,
    });
    this.client.setLogLevel(LogLevel.ERROR);
    // Hub messages are plain text; don't let * or _ turn into formatting.
    this.client.setParseMode(undefined);
  }

  /** Connects in the background and keeps reconnecting; never throws. */
  start(): void {
    void this.ensureConnected();
    this.watchdog = setInterval(() => void this.ensureConnected(), WATCHDOG_MS);
    this.watchdog.unref();
  }

  async stop(): Promise<void> {
    if (this.watchdog) clearInterval(this.watchdog);
    await this.client.disconnect().catch(() => undefined);
  }

  private ensureConnected(): Promise<void> {
    if (this.client.connected) return Promise.resolve();
    this.connecting ??= (async () => {
      try {
        await this.client.connect();
        if (!(await this.client.checkAuthorization())) {
          console.error("telegram session is not signed in; run `npm run telegram-login` and update TELEGRAM_SESSION");
        } else {
          console.log("telegram connected");
        }
      } catch (err) {
        console.error(`telegram connect failed: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        this.connecting = undefined;
      }
    })();
    return this.connecting;
  }

  async isReady(): Promise<boolean> {
    return this.client.connected === true;
  }

  private async requireConnection(): Promise<void> {
    if (!this.client.connected) await this.ensureConnected();
    if (!this.client.connected) throw new BridgeError(503, "Telegram: not connected, try again shortly");
  }

  async syncGroups(): Promise<Group[]> {
    await this.requireConnection();
    try {
      const dialogs = await withFloodRetry(() => this.client.getDialogs({}));
      return dialogs
        .filter((d) => (d.isGroup || d.isChannel) && canPost(d.entity))
        .map((d) => ({
          id: utils.getPeerId(d.entity!),
          name: d.title?.trim() || "(untitled)",
        }));
    } catch (err) {
      throw toTelegramError(err);
    }
  }

  private async resolvePeer(chatId: string): Promise<Api.TypeInputPeer> {
    if (!/^-?\d+$/.test(chatId)) {
      throw new BridgeError(400, "Telegram: chatId must be a numeric chat id like -1001234567890");
    }
    const id = bigInt(chatId);
    try {
      return await this.client.getInputEntity(id);
    } catch {
      // After a restart the entity cache is empty; one dialog fetch fills it.
    }
    await withFloodRetry(() => this.client.getDialogs({}));
    try {
      return await this.client.getInputEntity(id);
    } catch {
      throw new BridgeError(404, "Telegram: chat not found, refresh groups and check the account is still a member");
    }
  }

  async send(input: SendInput): Promise<void> {
    await this.requireConnection();
    try {
      const peer = await this.resolvePeer(input.chatId);
      if (!input.file) {
        await withFloodRetry(() => this.client.sendMessage(peer, { message: input.message }));
        return;
      }

      const { name, data } = input.file;
      const captionFits = input.message.length <= CAPTION_LIMIT;
      await withFloodRetry(() =>
        this.client.sendFile(peer, {
          file: new CustomFile(name, data.length, "", data),
          caption: captionFits ? input.message : undefined,
          forceDocument: false,
          supportsStreaming: true,
          workers: 4,
        }),
      );
      if (!captionFits) {
        await withFloodRetry(() => this.client.sendMessage(peer, { message: input.message }));
      }
    } catch (err) {
      throw toTelegramError(err);
    }
  }
}
