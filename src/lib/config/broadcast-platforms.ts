/**
 * broadcast-platforms config
 *
 * The messaging platforms shown as tabs on the Broadcast page. Client-safe: no env
 * access, so the page can import it directly (unlike whatsapp-accounts.ts).
 *
 * Only WhatsApp is wired up. Telegram and Signal tabs render the same page with no
 * groups and no history until their sending services and Make.com scenarios exist:
 *   - Telegram posts from Ali's own account via a small GramJS service.
 *   - Signal posts from a linked number via self-hosted signal-cli-rest-api.
 * When one goes live, give it accounts in whatsapp-accounts.ts (each platform
 * account is just another account_id in the queue tables) and flip `connected`.
 */

export type BroadcastPlatformId = 'whatsapp' | 'telegram' | 'signal';

export type BroadcastPlatform = {
  id: BroadcastPlatformId;
  name: string;
  /** Brand colour, used for the header icon, tab icon, attach hover and send button */
  color: string;
  connected: boolean;
  /** Account tab label for platforms without real accounts yet */
  accountLabel: string;
};

export const BROADCAST_PLATFORMS: BroadcastPlatform[] = [
  { id: 'whatsapp', name: 'WhatsApp', color: '#25D366', connected: true, accountLabel: '' },
  { id: 'telegram', name: 'Telegram', color: '#229ED9', connected: false, accountLabel: "Ali's account" },
  { id: 'signal', name: 'Signal', color: '#3A76F0', connected: false, accountLabel: 'AIIT Signal' },
];
