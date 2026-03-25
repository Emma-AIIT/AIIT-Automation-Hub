/**
 * whatsapp-accounts config
 *
 * Defines the WhatsApp accounts managed by this hub and resolves their Make.com webhook URLs.
 * Each account maps to a separate Green API instance and a set of Make.com scenarios.
 *
 * Active accounts:
 *   - aiit-automation: AIIT Automation (fully active)
 *
 * Configured but inactive (tabs hidden in UI — un-comment in WHATSAPP_ACCOUNTS to enable):
 *   - susu-closets:   Susu Closets
 *   - gim-foundation: GIM Foundation
 *
 * To add a new account:
 *   1. Add to WhatsAppAccountId union type
 *   2. Add entry to WHATSAPP_ACCOUNTS array
 *   3. Add 3 env vars: MAKE_WHATSAPP_<NAME>_PULL_GROUPS_WEBHOOK_URL,
 *      _SEND_MESSAGE_WEBHOOK_URL, _PULL_PARTICIPANTS_WEBHOOK_URL
 *   4. Add env vars to .env, .env.example, env.js, and Vercel dashboard
 *   5. Add entry to getWebhookUrl() map below
 *
 * SERVER-SIDE ONLY — do not import this file in client components.
 */
import { env } from '~/env';

export type WhatsAppAccountId =
  | 'aiit-automation'
  | 'susu-closets'
  | 'gim-foundation';

export type WebhookType = 'syncGroups' | 'sendMessage' | 'syncParticipants';

export type WhatsAppAccount = {
  id: WhatsAppAccountId;
  name: string;
  /** Tailwind color class suffix used for the tab indicator dot */
  color: string;
};

export const WHATSAPP_ACCOUNTS: WhatsAppAccount[] = [
  { id: 'aiit-automation', name: 'AIIT Automation', color: 'blue' },
  // { id: 'susu-closets',    name: 'Susu Closets',    color: 'pink' },   // not set up yet
  // { id: 'gim-foundation',  name: 'GIM Foundation',  color: 'green' },  // not set up yet
];

/**
 * Returns the Make.com webhook URL for a given account and webhook type.
 * Throws if the env var is not set, so callers surface a clear error.
 * SERVER-SIDE ONLY — do not import in client components.
 */
export function getWebhookUrl(accountId: WhatsAppAccountId, type: WebhookType): string {
  const map: Record<WhatsAppAccountId, Record<WebhookType, string | undefined>> = {
    'aiit-automation': {
      syncGroups:       env.MAKE_WHATSAPP_PULL_GROUPS_WEBHOOK_URL,
      sendMessage:      env.MAKE_WHATSAPP_SEND_MESSAGE_WEBHOOK_URL,
      syncParticipants: env.MAKE_WHATSAPP_PULL_PARTICIPANTS_WEBHOOK_URL,
    },
    'susu-closets': {
      syncGroups:       env.MAKE_WHATSAPP_SUSU_PULL_GROUPS_WEBHOOK_URL,
      sendMessage:      env.MAKE_WHATSAPP_SUSU_SEND_MESSAGE_WEBHOOK_URL,
      syncParticipants: env.MAKE_WHATSAPP_SUSU_PULL_PARTICIPANTS_WEBHOOK_URL,
    },
    'gim-foundation': {
      syncGroups:       env.MAKE_WHATSAPP_GIM_PULL_GROUPS_WEBHOOK_URL,
      sendMessage:      env.MAKE_WHATSAPP_GIM_SEND_MESSAGE_WEBHOOK_URL,
      syncParticipants: env.MAKE_WHATSAPP_GIM_PULL_PARTICIPANTS_WEBHOOK_URL,
    },
  };

  const url = map[accountId]?.[type];
  if (!url) throw new Error(`Webhook not configured: ${accountId}.${type}`);
  return url;
}
