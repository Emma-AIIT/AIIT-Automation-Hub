/**
 * whatsapp-accounts config
 *
 * Defines the messaging accounts managed by this hub and resolves their send/sync URLs.
 * Despite the name, an account can be on any Broadcast platform (`platform` field):
 * the broadcast queue, scheduler, cron and history are all keyed by account_id, so a
 * Telegram or Signal account is just another account_id in the same tables.
 *
 * WhatsApp accounts map to a Green API instance and a set of Make.com scenarios:
 *   - aiit-automation: AIIT Automation (fully active)
 *   - aiit-business:   AIIT Business Account
 *
 * Telegram and Signal accounts are served by the messaging bridge
 * (services/messaging-bridge, see its SETUP.md), which the Hub calls directly:
 *   - telegram-ali: Ali's own Telegram account (GramJS)
 *   - signal-aiit:  the linked AIIT Signal number (signal-cli-rest-api)
 * The bridge only does groups + sending; participant sync and 1:1 participant
 * messages stay WhatsApp-only, so those webhook types are left unconfigured.
 * telegram-ali can instead run in Telegram direct mode (GramJS inside the Hub,
 * no bridge server) when TELEGRAM_API_ID/_API_HASH/_SESSION are set; see
 * getTelegramMode. Direct mode has no URL, so "is it set up" checks use
 * isSendConfigured / isBroadcastConfigured rather than getWebhookUrl.
 *
 * Configured but inactive (tabs hidden in UI — un-comment in WHATSAPP_ACCOUNTS to enable):
 *   - susu-closets:   Susu Closets
 *   - gim-foundation: GIM Foundation
 *
 * To add a new WhatsApp account:
 *   1. Add to WhatsAppAccountId union type
 *   2. Add entry to WHATSAPP_ACCOUNTS array
 *   3. Add 3 env vars: MAKE_WHATSAPP_<NAME>_PULL_GROUPS_WEBHOOK_URL,
 *      _SEND_MESSAGE_WEBHOOK_URL, _PULL_PARTICIPANTS_WEBHOOK_URL
 *   4. Add env vars to .env, .env.example, env.js, and Vercel dashboard
 *   5. Add entry to getWebhookUrl() map below
 *
 * SERVER-SIDE ONLY for getWebhookUrl / isBroadcastConfigured (they read server env).
 * The account list itself is safe to import in client components.
 */
import { env } from '~/env';
import { BROADCAST_PLATFORMS } from '~/lib/config/broadcast-platforms';
import type { BroadcastPlatformId } from '~/lib/config/broadcast-platforms';
import { resolveTelegramMode } from '~/lib/config/telegram-mode';
import type { TelegramMode } from '~/lib/config/telegram-mode';

export type WhatsAppAccountId =
  | 'aiit-automation'
  | 'aiit-business'
  | 'susu-closets'
  | 'gim-foundation'
  | 'telegram-ali'
  | 'signal-aiit';

export type WebhookType =
  | 'syncGroups'
  | 'sendMessage'
  | 'sendParticipantMessage'
  | 'syncParticipants';

export type WhatsAppAccount = {
  id: WhatsAppAccountId;
  name: string;
  /** Tailwind color class suffix used for the tab indicator dot */
  color: string;
  platform: BroadcastPlatformId;
};

export const WHATSAPP_ACCOUNTS: WhatsAppAccount[] = [
  { id: 'aiit-automation', name: 'AIIT Automation', color: 'blue', platform: 'whatsapp' },
  { id: 'aiit-business',   name: 'AIIT Business Account', color: 'amber', platform: 'whatsapp' },
  // { id: 'susu-closets',    name: 'Susu Closets',    color: 'pink', platform: 'whatsapp' },   // not set up yet
  // { id: 'gim-foundation',  name: 'GIM Foundation',  color: 'green', platform: 'whatsapp' },  // not set up yet
  { id: 'telegram-ali',    name: "Ali's account", color: 'sky', platform: 'telegram' },
  { id: 'signal-aiit',     name: 'AIIT Signal', color: 'indigo', platform: 'signal' },
];

/** Accounts on one platform, in display order. */
export function accountsForPlatform(platform: BroadcastPlatformId): WhatsAppAccount[] {
  return WHATSAPP_ACCOUNTS.filter((a) => a.platform === platform);
}

/** Platform of an account id, falling back to WhatsApp for unknown (legacy) ids. */
export function getAccountPlatform(accountId: string): BroadcastPlatformId {
  return WHATSAPP_ACCOUNTS.find((a) => a.id === accountId)?.platform ?? 'whatsapp';
}

/** "WhatsApp" / "Telegram" / "Signal" for an account id, for alert emails and errors. */
export function getPlatformName(accountId: string): string {
  const platform = getAccountPlatform(accountId);
  return BROADCAST_PLATFORMS.find((p) => p.id === platform)?.name ?? 'WhatsApp';
}

/**
 * Returns the send/sync URL for a given account and webhook type: a Make.com webhook
 * for WhatsApp accounts, a messaging bridge endpoint for Telegram and Signal.
 * Throws if the env var is not set, so callers surface a clear error.
 * SERVER-SIDE ONLY — do not import in client components.
 */
export function getWebhookUrl(accountId: WhatsAppAccountId, type: WebhookType): string {
  const map: Record<WhatsAppAccountId, Record<WebhookType, string | undefined>> = {
    'aiit-automation': {
      syncGroups:             env.MAKE_WHATSAPP_PULL_GROUPS_WEBHOOK_URL,
      sendMessage:            env.MAKE_WHATSAPP_SEND_MESSAGE_WEBHOOK_URL,
      sendParticipantMessage: env.MAKE_WHATSAPP_SEND_PARTICIPANT_MESSAGE_WEBHOOK_URL,
      syncParticipants:       env.MAKE_WHATSAPP_PULL_PARTICIPANTS_WEBHOOK_URL,
    },
    'aiit-business': {
      syncGroups:             env.MAKE_WHATSAPP_BUSINESS_PULL_GROUPS_WEBHOOK_URL,
      sendMessage:            env.MAKE_WHATSAPP_BUSINESS_SEND_MESSAGE_WEBHOOK_URL,
      sendParticipantMessage: env.MAKE_WHATSAPP_BUSINESS_SEND_PARTICIPANT_MESSAGE_WEBHOOK_URL,
      syncParticipants:       env.MAKE_WHATSAPP_BUSINESS_PULL_PARTICIPANTS_WEBHOOK_URL,
    },
    'susu-closets': {
      syncGroups:             env.MAKE_WHATSAPP_SUSU_PULL_GROUPS_WEBHOOK_URL,
      sendMessage:            env.MAKE_WHATSAPP_SUSU_SEND_MESSAGE_WEBHOOK_URL,
      sendParticipantMessage: env.MAKE_WHATSAPP_SUSU_SEND_PARTICIPANT_MESSAGE_WEBHOOK_URL,
      syncParticipants:       env.MAKE_WHATSAPP_SUSU_PULL_PARTICIPANTS_WEBHOOK_URL,
    },
    'gim-foundation': {
      syncGroups:             env.MAKE_WHATSAPP_GIM_PULL_GROUPS_WEBHOOK_URL,
      sendMessage:            env.MAKE_WHATSAPP_GIM_SEND_MESSAGE_WEBHOOK_URL,
      sendParticipantMessage: env.MAKE_WHATSAPP_GIM_SEND_PARTICIPANT_MESSAGE_WEBHOOK_URL,
      syncParticipants:       env.MAKE_WHATSAPP_GIM_PULL_PARTICIPANTS_WEBHOOK_URL,
    },
    'telegram-ali': {
      syncGroups:             env.TELEGRAM_BRIDGE_SYNC_GROUPS_URL,
      sendMessage:            env.TELEGRAM_BRIDGE_SEND_URL,
      sendParticipantMessage: undefined, // WhatsApp-only
      syncParticipants:       undefined, // WhatsApp-only
    },
    'signal-aiit': {
      syncGroups:             env.SIGNAL_BRIDGE_SYNC_GROUPS_URL,
      sendMessage:            env.SIGNAL_BRIDGE_SEND_URL,
      sendParticipantMessage: undefined, // WhatsApp-only
      syncParticipants:       undefined, // WhatsApp-only
    },
  };

  const url = map[accountId]?.[type];
  if (!url) throw new Error(`Webhook not configured: ${accountId}.${type}`);
  return url;
}

/**
 * How telegram-ali reaches Telegram: "direct" (GramJS inside the Hub, see
 * src/lib/server/telegram.ts), "bridge" (messaging bridge URLs), or null when
 * neither is set up. Direct wins when both are configured. SERVER-SIDE ONLY.
 */
export function getTelegramMode(): TelegramMode {
  return resolveTelegramMode({
    apiId: env.TELEGRAM_API_ID,
    apiHash: env.TELEGRAM_API_HASH,
    session: env.TELEGRAM_SESSION,
    bridgeSyncUrl: env.TELEGRAM_BRIDGE_SYNC_GROUPS_URL,
    bridgeSendUrl: env.TELEGRAM_BRIDGE_SEND_URL,
  });
}

/** True when this account sends through Telegram direct mode rather than a URL. SERVER-SIDE ONLY. */
export function isTelegramDirect(accountId: string): boolean {
  return accountId === 'telegram-ali' && getTelegramMode() === 'direct';
}

/**
 * True when broadcasts on this account can be sent: Telegram direct mode, or a
 * send URL from getWebhookUrl. For "fail fast" checks before queueing. SERVER-SIDE ONLY.
 */
export function isSendConfigured(accountId: WhatsAppAccountId): boolean {
  if (isTelegramDirect(accountId)) return true;
  try {
    getWebhookUrl(accountId, 'sendMessage');
    return true;
  } catch {
    return false;
  }
}

/** True when an account has both its group sync and send set up. SERVER-SIDE ONLY. */
export function isBroadcastConfigured(accountId: WhatsAppAccountId): boolean {
  if (isTelegramDirect(accountId)) return true;
  try {
    getWebhookUrl(accountId, 'syncGroups');
    getWebhookUrl(accountId, 'sendMessage');
    return true;
  } catch {
    return false;
  }
}
