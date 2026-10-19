/**
 * How the telegram-ali account reaches Telegram. Kept free of imports so the
 * precedence rule can be unit-tested on its own (tests/telegram.test.mjs).
 *
 *   - "direct": the Hub logs in as Ali's account itself with GramJS on every
 *     operation (src/lib/server/telegram.ts). Needs all three TELEGRAM_API_ID,
 *     TELEGRAM_API_HASH and TELEGRAM_SESSION.
 *   - "bridge": the always-on messaging bridge (services/messaging-bridge).
 *     Needs both TELEGRAM_BRIDGE_* URLs.
 *   - null: neither is set up, so the Broadcast tab shows "not set up yet".
 *
 * Direct wins when both are configured: it has no server to keep running.
 */
export type TelegramMode = "direct" | "bridge" | null;

export function resolveTelegramMode(vars: {
  apiId?: string | number;
  apiHash?: string;
  session?: string;
  bridgeSyncUrl?: string;
  bridgeSendUrl?: string;
}): TelegramMode {
  if (vars.apiId && vars.apiHash && vars.session) return "direct";
  if (vars.bridgeSyncUrl && vars.bridgeSendUrl) return "bridge";
  return null;
}
