/**
 * Live billing checks for the Subscriptions page.
 *
 * Each check is a single read-only request to the provider's API, run when the
 * hub is opened (not on a timer). A missing key or failed request returns
 * `checked: false` with a reason, and the page falls back to the dates in
 * src/config/subscriptions.ts, so a broken check never hides a renewal.
 *
 * Keys: ELEVENLABS_API_KEY, MAKE_API_KEY, VERCEL_API_TOKEN, and the existing
 * TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN. Vapi has no balance endpoint for
 * private keys, so it stays manual.
 *
 * SERVER-SIDE ONLY.
 */
import { env } from '~/env';
import { SUBSCRIPTIONS, type LiveCheckId, type Subscription } from '@/config/subscriptions';
import { formatMoney, type LiveResult, type LiveResults } from '@/lib/subscriptions';

const CHECK_TIMEOUT_MS = 8_000;

const MAKE_ZONE = 'eu2.make.com';
const MAKE_ORG_ID = 2987012;
const VERCEL_TEAM_ID = 'team_gd1IHqajB0tgVPdSxXHkmeyM';

/** Share of the monthly Make operations allowance that counts as "nearly out" */
const MAKE_OPS_WARNING = 0.9;

class CheckError extends Error {}

async function getJson<T>(url: string, headers: Record<string, string>): Promise<T> {
  const res = await fetch(url, {
    headers,
    cache: 'no-store',
    signal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
  });
  if (res.status === 401 || res.status === 403) {
    throw new CheckError(`key rejected (HTTP ${res.status})`);
  }
  if (!res.ok) throw new CheckError(`HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

function unixToIso(seconds: number | null | undefined): string | null {
  return seconds ? new Date(seconds * 1000).toISOString() : null;
}

// ─── Providers ───────────────────────────────────────────────────────────────

async function checkElevenLabs(): Promise<LiveResult> {
  const key = env.ELEVENLABS_API_KEY;
  if (!key) return { checked: false, reason: 'ELEVENLABS_API_KEY not set' };

  const sub = await getJson<{
    tier?: string;
    status?: string;
    character_count?: number;
    character_limit?: number;
    next_character_count_reset_unix?: number;
    currency?: string;
    next_invoice?: { amount_due_cents?: number } | null;
  }>('https://api.elevenlabs.io/v1/user/subscription', { 'xi-api-key': key });

  const cents = sub.next_invoice?.amount_due_cents;

  // "past_due" is what took the voice agents down in Sep 2026
  const healthy = sub.status === 'active' || sub.status === 'trialing' || sub.status === 'free';
  const used =
    sub.character_limit ? ` · ${(sub.character_count ?? 0).toLocaleString()} / ${sub.character_limit.toLocaleString()} characters` : '';

  return {
    checked: true,
    problem: healthy ? null : `Payment failed: ElevenLabs reports the account as "${sub.status ?? 'unknown'}". Voice calls will fail until it is paid.`,
    nextRenewal: unixToIso(sub.next_character_count_reset_unix),
    detail: `${sub.tier ?? 'Unknown'} plan, ${sub.status ?? 'unknown'}${used}`,
    price: typeof cents === 'number' ? { amount: cents / 100, currency: (sub.currency ?? 'usd').toUpperCase() } : null,
  };
}

type MakeOrganization = {
  productName?: string;
  nextReset?: string;
  operations?: string | number;
  license?: { operations?: number };
};

async function checkMake(): Promise<LiveResult> {
  const key = env.MAKE_API_KEY;
  if (!key) return { checked: false, reason: 'MAKE_API_KEY not set' };

  const json = await getJson<{ organization?: MakeOrganization } & MakeOrganization>(
    `https://${MAKE_ZONE}/api/v2/organizations/${MAKE_ORG_ID}`,
    { Authorization: `Token ${key}` },
  );
  const org = json.organization ?? json;

  const used = Number(org.operations ?? 0);
  const limit = org.license?.operations ?? 0;
  const plan = org.productName ?? 'Unknown';

  let problem: string | null = null;
  if (plan.toLowerCase() === 'free') {
    problem = 'The Make plan has dropped to Free. Scenarios will stop once the free operations run out.';
  } else if (limit > 0 && used / limit >= MAKE_OPS_WARNING) {
    problem = `Operations nearly used up (${Math.round((used / limit) * 100)}%). Scenarios stop when they run out.`;
  }

  return {
    checked: true,
    problem,
    nextRenewal: org.nextReset ?? null,
    price: null,
    detail: `${plan} plan · ${used.toLocaleString()} / ${limit.toLocaleString()} operations this month`,
  };
}

async function checkVercel(): Promise<LiveResult> {
  const token = env.VERCEL_API_TOKEN;
  if (!token) return { checked: false, reason: 'VERCEL_API_TOKEN not set' };

  const team = await getJson<{
    billing?: { plan?: string; status?: string; period?: { end?: number } };
  }>(`https://api.vercel.com/v2/teams/${VERCEL_TEAM_ID}`, { Authorization: `Bearer ${token}` });

  const { plan = 'unknown', status = 'unknown', period } = team.billing ?? {};

  let problem: string | null = null;
  if (status !== 'active') {
    problem = `Vercel reports the plan as "${status}". The dashboard and its webhooks may go offline.`;
  } else if (plan === 'hobby') {
    problem = 'The Vercel plan has dropped to Hobby (free). Cron jobs and team access are limited.';
  }

  return {
    checked: true,
    problem,
    nextRenewal: period?.end ? new Date(period.end).toISOString() : null,
    price: null,
    detail: `${plan.charAt(0).toUpperCase()}${plan.slice(1)} plan, ${status}`,
  };
}

async function checkTwilio(sub: Subscription): Promise<LiveResult> {
  const sid = env.TWILIO_ACCOUNT_SID;
  const token = env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) return { checked: false, reason: 'TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN not set' };

  const res = await getJson<{ balance?: string; currency?: string }>(
    `https://api.twilio.com/2010-04-01/Accounts/${sid}/Balance.json`,
    { Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}` },
  );

  const balance = Number(res.balance ?? NaN);
  if (Number.isNaN(balance)) throw new CheckError('no balance in response');
  const currency = res.currency ?? 'USD';
  const floor = sub.lowBalance ?? 0;

  return {
    checked: true,
    problem:
      balance < floor
        ? `Balance is low (${formatMoney({ amount: balance, currency })}). SMS and calls stop when it reaches zero.`
        : null,
    nextRenewal: null,
    price: null,
    detail: `Balance ${formatMoney({ amount: balance, currency })}`,
  };
}

const CHECKS: Record<LiveCheckId, (sub: Subscription) => Promise<LiveResult>> = {
  elevenlabs: checkElevenLabs,
  make: checkMake,
  vercel: checkVercel,
  twilio: checkTwilio,
};

// ─── Entry point ─────────────────────────────────────────────────────────────

/** Runs every configured check in parallel. Never throws. */
export async function runSubscriptionChecks(): Promise<LiveResults> {
  const withChecks = SUBSCRIPTIONS.filter((s) => s.live);

  const results = await Promise.all(
    withChecks.map(async (sub): Promise<[string, LiveResult]> => {
      try {
        return [sub.id, await CHECKS[sub.live!](sub)];
      } catch (err) {
        const reason =
          err instanceof CheckError
            ? err.message
            : err instanceof Error && err.name === 'TimeoutError'
              ? 'timed out'
              : 'request failed';
        console.warn(`[subscriptions] ${sub.id} check failed:`, err);
        return [sub.id, { checked: false, reason }];
      }
    }),
  );

  return Object.fromEntries(results);
}
