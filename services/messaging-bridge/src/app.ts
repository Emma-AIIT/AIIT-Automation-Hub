import { createHash, timingSafeEqual } from "node:crypto";
import { Hono, type Context } from "hono";
import { bodyLimit } from "hono/body-limit";
import { HTTPException } from "hono/http-exception";
import { timeout } from "hono/timeout";
import { BridgeError, type Platform, type SendInput } from "./platform";

export const MAX_FILE_BYTES = 10 * 1024 * 1024;
/** Multipart overhead on top of the 10 MB file (boundaries, other fields). */
const MAX_BODY_BYTES = MAX_FILE_BYTES + 512 * 1024;
/** Stays below the Hub's 60 s fetch timeout so it gets a readable error, not a hang-up. */
export const REQUEST_TIMEOUT_MS = 55_000;

const PLATFORMS = {
  telegram: "Telegram",
  signal: "Signal",
} as const;
type PlatformKey = keyof typeof PLATFORMS;

export type AppOptions = {
  secret: string;
  telegram?: Platform;
  signal?: Platform;
  log?: (line: string) => void;
};

function sha256(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}

/** Constant-time comparison; hashing first makes both sides the same length. */
export function keyMatches(given: string | undefined, secret: string): boolean {
  if (!given) return false;
  return timingSafeEqual(sha256(given), sha256(secret));
}

async function parseSendRequest(c: Context, label: string): Promise<SendInput> {
  const contentType = c.req.header("content-type") ?? "";
  let chatId: unknown;
  let message: unknown;
  let file: unknown;

  if (contentType.startsWith("multipart/form-data")) {
    const body = await c.req.parseBody();
    chatId = body.chatId;
    message = body.message;
    file = body.file;
  } else {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      throw new BridgeError(400, `${label}: body must be JSON or multipart/form-data`);
    }
    if (typeof body === "object" && body !== null) {
      ({ chatId, message } = body as Record<string, unknown>);
    }
  }

  if (typeof chatId !== "string" || chatId.trim() === "") {
    throw new BridgeError(400, `${label}: chatId is required`);
  }
  if (message !== undefined && typeof message !== "string") {
    throw new BridgeError(400, `${label}: message must be a string`);
  }
  const text = message ?? "";

  if (file instanceof File) {
    if (file.size > MAX_FILE_BYTES) {
      throw new BridgeError(413, `${label}: file is larger than 10 MB`);
    }
    return {
      chatId: chatId.trim(),
      message: text,
      file: {
        name: file.name || "file",
        type: file.type || "application/octet-stream",
        data: Buffer.from(await file.arrayBuffer()),
      },
    };
  }

  if (text.trim() === "") {
    throw new BridgeError(400, `${label}: message is required when no file is sent`);
  }
  return { chatId: chatId.trim(), message: text };
}

export function createApp(options: AppOptions): Hono {
  const log = options.log ?? ((line: string) => console.log(line));
  const app = new Hono();

  app.onError((err, c) => {
    if (err instanceof BridgeError) return c.text(err.message, err.status);
    if (err instanceof HTTPException) return c.text(err.message, err.status);
    console.error(err);
    return c.text("Bridge: unexpected error", 500);
  });

  app.get("/health", async (c) => {
    const ready = async (platform?: Platform) => {
      if (!platform) return false;
      try {
        return await platform.isReady();
      } catch {
        return false;
      }
    };
    const [telegram, signal] = await Promise.all([
      ready(options.telegram),
      ready(options.signal),
    ]);
    return c.json({ ok: true, telegram, signal });
  });

  for (const key of Object.keys(PLATFORMS) as PlatformKey[]) {
    const label = PLATFORMS[key];
    const platform = options[key];

    // Auth first, so an unauthenticated caller learns nothing about the setup.
    app.use(`/${key}/*`, async (c, next) => {
      if (!keyMatches(c.req.query("key"), options.secret)) {
        log(`${key} ${c.req.path.split("/").pop()} unauthorized`);
        return c.text("Unauthorized", 401);
      }
      if (!platform) return c.text(`${label} is not configured`, 503);
      await next();
    });

    app.use(
      `/${key}/*`,
      timeout(
        REQUEST_TIMEOUT_MS,
        () => new HTTPException(504, { message: `${label}: timed out after ${REQUEST_TIMEOUT_MS / 1000}s` }),
      ),
    );

    app.post(`/${key}/sync-groups`, async (c) => {
      try {
        const groups = await platform!.syncGroups();
        log(`${key} sync-groups ok count=${groups.length}`);
        return c.json({ synced: groups.length, groups });
      } catch (err) {
        log(`${key} sync-groups error=${errorText(err)}`);
        throw err;
      }
    });

    app.post(
      `/${key}/send`,
      bodyLimit({
        maxSize: MAX_BODY_BYTES,
        onError: (c) => c.text(`${label}: file is larger than 10 MB`, 413),
      }),
      async (c) => {
        let chatId = "-";
        try {
          const input = await parseSendRequest(c, label);
          chatId = input.chatId;
          await platform!.send(input);
          log(`${key} send chat=${chatId} file=${input.file ? "yes" : "no"} ok`);
          return c.json({ ok: true });
        } catch (err) {
          log(`${key} send chat=${chatId} error=${errorText(err)}`);
          throw err;
        }
      },
    );
  }

  return app;
}

function errorText(err: unknown): string {
  return JSON.stringify(err instanceof Error ? err.message : String(err));
}
