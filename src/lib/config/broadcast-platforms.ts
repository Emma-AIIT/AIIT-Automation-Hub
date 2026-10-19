/**
 * broadcast-platforms config
 *
 * The messaging platforms shown as tabs on the Broadcast page. Client-safe: no env
 * access, so the page can import it directly (unlike whatsapp-accounts.ts).
 *
 * Each platform's accounts live in whatsapp-accounts.ts (every account is just an
 * account_id in the queue tables):
 *   - WhatsApp sends via Make.com scenarios and Green API.
 *   - Telegram posts from Ali's own account and Signal from a linked number, both
 *     through the messaging bridge (services/messaging-bridge).
 * Whether a platform is set up depends on server env, so it is not stored here: the
 * page asks whatsapp.getPlatforms, which reports `connected` per platform.
 */

export type BroadcastPlatformId = 'whatsapp' | 'telegram' | 'signal';

export type BroadcastPlatform = {
  id: BroadcastPlatformId;
  name: string;
  /** Brand colour, used for the header icon, tab icon, attach hover and send button */
  color: string;
};

export const BROADCAST_PLATFORMS: BroadcastPlatform[] = [
  { id: 'whatsapp', name: 'WhatsApp', color: '#25D366' },
  { id: 'telegram', name: 'Telegram', color: '#229ED9' },
  { id: 'signal', name: 'Signal', color: '#3A76F0' },
];
