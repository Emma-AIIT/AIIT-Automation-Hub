import type { SignalConfig } from "./signal";
import type { TelegramConfig } from "./telegram";

export type Config = {
  port: number;
  secret: string;
  telegram?: TelegramConfig;
  signal?: SignalConfig;
};

function value(env: NodeJS.ProcessEnv, name: string): string | undefined {
  const raw = env[name]?.trim();
  return raw ? raw : undefined;
}

/** Each platform is optional: it is only enabled when all of its variables are set. */
export function loadConfig(env: NodeJS.ProcessEnv): Config {
  const secret = value(env, "BRIDGE_SECRET");
  if (!secret || secret.length < 16) {
    throw new Error("BRIDGE_SECRET must be set (at least 16 characters; use `openssl rand -hex 32`)");
  }

  const apiId = value(env, "TELEGRAM_API_ID");
  const apiHash = value(env, "TELEGRAM_API_HASH");
  const session = value(env, "TELEGRAM_SESSION");
  let telegram: TelegramConfig | undefined;
  if (apiId && apiHash && session) {
    if (!/^\d+$/.test(apiId)) throw new Error("TELEGRAM_API_ID must be a number");
    telegram = { apiId: Number(apiId), apiHash, session };
  }

  const number = value(env, "SIGNAL_NUMBER");
  const signal = number
    ? { number, apiUrl: value(env, "SIGNAL_API_URL") ?? "http://signal-api:8080" }
    : undefined;

  return { port: Number(value(env, "PORT") ?? 3000), secret, telegram, signal };
}
