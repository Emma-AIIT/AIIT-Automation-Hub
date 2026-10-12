/**
 * Renewal maths for the subscriptions in `@/config/subscriptions`.
 * Shared by the Subscriptions page and the renewal reminder pop-up.
 * Client-safe: live billing results are fetched server-side
 * (src/lib/server/subscription-checks.ts) and merged in here.
 */
import { addMonths, addYears, differenceInCalendarDays, parseISO, startOfDay } from 'date-fns';
import { SUBSCRIPTIONS, type Subscription } from '@/config/subscriptions';

/** Days before a renewal that it is flagged */
export const REMINDER_DAYS = 5;

/**
 * - problem:  live check found a failed payment, low balance or usage limit (red, pop-up)
 * - urgent:   a manually paid plan renews within REMINDER_DAYS (red, pop-up)
 * - charging: an auto-paid plan renews within REMINDER_DAYS (blue heads-up, no pop-up)
 */
export type RenewalStatus =
  | 'problem'
  | 'urgent'
  | 'charging'
  | 'soon'
  | 'ok'
  | 'prepaid'
  | 'free'
  | 'unknown';

export interface Price {
  amount: number;
  currency: string;
}

/** Result of one provider billing check */
export type LiveResult =
  | {
      checked: true;
      /** Plain-English description of what is wrong, or null if all is well */
      problem: string | null;
      /** Next renewal reported by the provider (ISO), when it has one */
      nextRenewal: string | null;
      /** Extra context shown under the row, e.g. usage or balance */
      detail: string | null;
      /** Amount of the next charge, when the provider reports it */
      price: Price | null;
    }
  | { checked: false; reason: string };

export type LiveResults = Record<string, LiveResult>;

export interface Renewal {
  subscription: Subscription;
  /** Next renewal on or after today. null for prepaid / unknown dates */
  nextDate: Date | null;
  daysLeft: number | null;
  /** Days since the previous renewal, when it was within the last 3 days */
  renewedDaysAgo: number | null;
  status: RenewalStatus;
  /** Live billing check for this subscription, if it has one and it has run */
  live: LiveResult | null;
}

export function isAutoPay(s: Subscription): boolean {
  return s.autoPay ?? (s.cycle === 'monthly' || s.cycle === 'yearly');
}

/** Whether a renewal should raise the pop-up */
export function needsAttention(r: Renewal): boolean {
  return r.status === 'problem' || r.status === 'urgent';
}

function step(date: Date, cycle: Subscription['cycle'], n: number): Date {
  return cycle === 'yearly' ? addYears(date, n) : addMonths(date, n);
}

export function getRenewal(subscription: Subscription, now = new Date(), live: LiveResult | null = null): Renewal {
  const today = startOfDay(now);
  const { cycle, renewsOn } = subscription;
  const problem = live?.checked ? live.problem : null;

  let nextDate: Date | null = null;
  let renewedDaysAgo: number | null = null;

  // A date reported by the provider beats the config, as long as it is not in
  // the past (a frozen past date is itself a sign the payment failed).
  const liveNext = live?.checked && live.nextRenewal ? startOfDay(parseISO(live.nextRenewal)) : null;

  if (liveNext && liveNext >= today) {
    nextDate = liveNext;
  } else if ((cycle === 'monthly' || cycle === 'yearly') && renewsOn) {
    // Roll the anchor forward (or back) to the first renewal on or after today.
    // Stepping from the anchor each time keeps month-end dates from drifting.
    const anchor = parseISO(renewsOn);
    let n = 0;
    while (step(anchor, cycle, n) < today) n++;
    while (n > 0 && step(anchor, cycle, n - 1) >= today) n--;

    nextDate = step(anchor, cycle, n);
    const sinceLast = n > 0 ? differenceInCalendarDays(today, step(anchor, cycle, n - 1)) : null;
    // Without a live check there is no way to know the charge went through
    if (!live?.checked && sinceLast !== null && sinceLast <= 3) renewedDaysAgo = sinceLast;
  }

  const daysLeft = nextDate ? differenceInCalendarDays(nextDate, today) : null;

  let status: RenewalStatus;
  if (problem) status = 'problem';
  else if (cycle === 'prepaid' || cycle === 'free') status = cycle;
  else if (daysLeft === null) status = 'unknown';
  else if (daysLeft <= REMINDER_DAYS) status = isAutoPay(subscription) ? 'charging' : 'urgent';
  else status = daysLeft <= 30 ? 'soon' : 'ok';

  return { subscription, nextDate, daysLeft, renewedDaysAgo, status, live };
}

/** All subscriptions, problems first, then soonest renewal; prepaid, unknown and free last */
export function getRenewals(now = new Date(), live: LiveResults = {}): Renewal[] {
  const rank: Record<RenewalStatus, number> = {
    problem: 0,
    urgent: 1,
    charging: 1,
    soon: 1,
    ok: 1,
    prepaid: 2,
    unknown: 3,
    free: 4,
  };
  return SUBSCRIPTIONS.map((s) => getRenewal(s, now, live[s.id] ?? null)).sort(
    (a, b) =>
      rank[a.status] - rank[b.status] ||
      (a.daysLeft ?? 0) - (b.daysLeft ?? 0) ||
      a.subscription.name.localeCompare(b.subscription.name),
  );
}

export function formatDaysLeft(daysLeft: number): string {
  if (daysLeft === 0) return 'Today';
  if (daysLeft === 1) return 'Tomorrow';
  return `${daysLeft} days`;
}

export function formatMoney({ amount, currency }: Price): string {
  const symbol = currency === 'USD' ? 'US$' : currency === 'AUD' ? 'A$' : `${currency} `;
  return `${symbol}${amount.toFixed(2)}`;
}

/** Price per cycle: the provider's live figure if it reported one, else the config */
export function getPrice(r: Renewal): Price | null {
  if (r.live?.checked && r.live.price) return r.live.price;
  const { cost, currency } = r.subscription;
  return cost === null ? null : { amount: cost, currency };
}

/**
 * Monthly spend across all paid plans, per currency (yearly plans divided by
 * 12). Prepaid and free services are excluded; `missing` counts paid plans
 * with no known price.
 */
export function getMonthlyTotals(renewals: Renewal[]): { totals: Price[]; missing: number } {
  const sums = new Map<string, number>();
  let missing = 0;
  for (const r of renewals) {
    const { cycle } = r.subscription;
    if (cycle !== 'monthly' && cycle !== 'yearly') continue;
    const price = getPrice(r);
    if (!price) {
      missing++;
      continue;
    }
    const monthly = cycle === 'yearly' ? price.amount / 12 : price.amount;
    sums.set(price.currency, (sums.get(price.currency) ?? 0) + monthly);
  }
  return { totals: [...sums].map(([currency, amount]) => ({ amount, currency })), missing };
}
