import { env } from '~/env';

export type WhatsAppAccountId =
  | 'aiit-automation'
  | 'susu-closets'
  | 'gim-foundation'
  | 'aiit-business';

export type WebhookType = 'syncGroups' | 'sendMessage' | 'syncParticipants';

export type WhatsAppAccount = {
  id: WhatsAppAccountId;
  name: string;
  /** Tailwind color class suffix used for the tab indicator dot */
  color: string;
};

export const WHATSAPP_ACCOUNTS: WhatsAppAccount[] = [
  { id: 'aiit-automation', name: 'AIIT Automation', color: 'blue' },
  { id: 'susu-closets',    name: 'Susu Closets',    color: 'pink' },
  { id: 'gim-foundation',  name: 'GIM Foundation',  color: 'green' },
  { id: 'aiit-business',   name: 'AIIT Business',   color: 'amber' },
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
    'aiit-business': {
      syncGroups:       env.MAKE_WHATSAPP_AIIT_BIZ_PULL_GROUPS_WEBHOOK_URL,
      sendMessage:      env.MAKE_WHATSAPP_AIIT_BIZ_SEND_MESSAGE_WEBHOOK_URL,
      syncParticipants: env.MAKE_WHATSAPP_AIIT_BIZ_PULL_PARTICIPANTS_WEBHOOK_URL,
    },
  };

  const url = map[accountId]?.[type];
  if (!url) throw new Error(`Webhook not configured: ${accountId}.${type}`);
  return url;
}
