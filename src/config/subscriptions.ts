/**
 * subscriptions config
 *
 * Every paid service the hub (and its Make.com / Vapi automations) depends on.
 * Drives the Subscriptions page, which counts down the days to each renewal so
 * they can be paid before a lapsed card takes the automations down. (The
 * Sep–Oct 2026 voice outage was an ElevenLabs payment that failed silently.)
 *
 * `renewsOn` is any one known billing date. The page rolls it forward by
 * `cycle` to find the next renewal, so it doesn't need editing every month —
 * only when a plan, price or billing day changes.
 *
 * To add a subscription:
 *   1. Find the next renewal date on the provider's billing page
 *   2. Add an entry here (leave `renewsOn` null if unknown — the page flags it)
 *
 * Cycles:
 *   - monthly / yearly: fixed renewal date
 *   - prepaid:          credit balance with no renewal date; it breaks when the
 *                       balance hits zero, so the page says to check the balance
 *   - free:             nothing to pay; listed so its usage limits stay visible
 *
 * Paid plans are assumed to charge the card automatically (`autoPay`), so an
 * upcoming renewal is shown as a heads-up rather than a red warning. Set
 * `autoPay: false` for anything that has to be paid by hand. Where `live` is
 * set, the hub asks the provider for its real billing status each time it is
 * opened (src/lib/server/subscription-checks.ts), and a failed payment or low
 * balance is what raises the red reminder.
 */

export type SubscriptionCycle = 'monthly' | 'yearly' | 'prepaid' | 'free';

/** Providers with a read-only billing check in src/lib/server/subscription-checks.ts */
export type LiveCheckId = 'elevenlabs' | 'make' | 'vercel' | 'twilio';

export interface Subscription {
  id: string;
  name: string;
  plan: string | null;
  cycle: SubscriptionCycle;
  /** Any known renewal date (YYYY-MM-DD). null = not confirmed yet */
  renewsOn: string | null;
  /** Price per cycle. null = not confirmed yet */
  cost: number | null;
  currency: 'AUD' | 'USD';
  /** Where to pay or update the card */
  billingUrl: string;
  /** What stops working if this lapses */
  breaks: string;
  /** Where the date/cost came from, so it can be re-checked */
  source?: string;
  /** Charged to a card automatically. Defaults to true for monthly/yearly plans */
  autoPay?: boolean;
  /** Provider billing check to run when the hub is opened */
  live?: LiveCheckId;
  /** Prepaid only: a live balance below this raises the reminder */
  lowBalance?: number;
}

export const SUBSCRIPTIONS: Subscription[] = [
  {
    id: 'elevenlabs',
    name: 'ElevenLabs',
    plan: 'Creator',
    cycle: 'monthly',
    renewsOn: '2026-10-23',
    cost: 24.2,
    currency: 'USD',
    billingUrl: 'https://elevenlabs.io/app/subscription/creative',
    breaks: 'Voice for 31 of 32 Vapi assistants (Anna and Ali Boss voices). Every call fails with "voice-failed".',
    source: 'ElevenLabs API, checked 2026-10-12',
    live: 'elevenlabs',
  },
  {
    id: 'make',
    name: 'Make.com',
    plan: 'Pro, 40,000 credits / month',
    cycle: 'monthly',
    renewsOn: '2026-11-12',
    cost: 62.35,
    currency: 'USD',
    billingUrl: 'https://eu2.make.com/organization/2987012/subscription',
    breaks: 'All automations: Xero sync, tickets, quote pipeline, WhatsApp broadcasts, invoicing logs.',
    source: 'make-cli organizations get + Make billing page (US$62.35/month), checked 2026-10-12',
    live: 'make',
  },
  {
    id: 'vapi',
    name: 'Vapi',
    plan: 'Prepaid credits',
    cycle: 'prepaid',
    renewsOn: null,
    cost: null,
    currency: 'USD',
    billingUrl: 'https://dashboard.vapi.ai/org/billing',
    breaks: 'All inbound and outbound voice agents.',
  },
  {
    id: 'twilio',
    name: 'Twilio',
    plan: 'Prepaid balance',
    cycle: 'prepaid',
    renewsOn: null,
    cost: null,
    currency: 'USD',
    billingUrl: 'https://console.twilio.com/us1/billing/manage-billing/billing-overview',
    breaks: 'Post-call SMS follow-ups and the phone numbers the agents answer on.',
    live: 'twilio',
    lowBalance: 20,
  },
  {
    id: 'supabase',
    name: 'Supabase',
    plan: 'Free (500 MB database, 1 GB file storage)',
    cycle: 'free',
    renewsOn: null,
    cost: null,
    currency: 'USD',
    billingUrl: 'https://supabase.com/dashboard/org/rbghwvklrdesaefaqsgo/billing',
    breaks: 'The hub database: every page in this dashboard shows empty. On the free plan that happens if a storage or database limit is hit, not from a missed payment.',
    source: 'Supabase API, checked 2026-10-12',
  },
  {
    id: 'vercel',
    name: 'Vercel',
    plan: 'Pro (seats + usage, US$20 usage credit included)',
    cycle: 'monthly',
    renewsOn: '2026-10-13',
    cost: 40,
    currency: 'USD',
    billingUrl: 'https://vercel.com/emmas-projects-4ac8e431/~/settings/billing',
    breaks: 'Hosting for this dashboard, its cron jobs and the Vapi webhooks.',
    source: 'Vercel billing page (upcoming invoice US$40.00), checked 2026-10-12',
    // No live check: Vercel tokens get 403 on team billing (/v2/teams/:id).
    // checkVercel() is kept for if a token with billing access is added.
  },
  {
    id: 'xero',
    name: 'Xero',
    plan: null,
    cycle: 'monthly',
    renewsOn: null,
    cost: null,
    currency: 'AUD',
    billingUrl: 'https://go.xero.com/Settings/Subscription',
    breaks: 'Debt Recovery and Proposal Pipeline sync.',
  },
  {
    id: 'microsoft-365',
    name: 'Microsoft 365',
    plan: null,
    cycle: 'monthly',
    renewsOn: null,
    cost: null,
    currency: 'AUD',
    billingUrl: 'https://admin.microsoft.com/#/subscriptions',
    breaks: 'Outlook: ticket intake and every email the automations send.',
  },
];
