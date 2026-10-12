/**
 * Subscriptions page at /automations/subscriptions.
 * Lists every paid service the hub depends on with its price, a countdown to
 * its next renewal, and (where the provider allows it) a live billing check
 * that catches failed payments and low balances. Totals the monthly spend at
 * the top. Subscription details live in `@/config/subscriptions`; live checks
 * run once each time the hub is opened (see useRenewals).
 */
'use client';

import { format } from 'date-fns';
import {
  REMINDER_DAYS,
  formatDaysLeft,
  formatMoney,
  getMonthlyTotals,
  getPrice,
  type Renewal,
} from '@/lib/subscriptions';
import { useRenewals } from '@/components/modules/subscriptions/useRenewals';
import { Skeleton } from '@/components/ui/Skeleton';

const STATUS_STYLES: Record<Renewal['status'], { pill: string; bar: string }> = {
  problem: { pill: 'bg-rose-100 text-rose-700', bar: 'bg-rose-500' },
  urgent: { pill: 'bg-rose-100 text-rose-700', bar: 'bg-rose-400' },
  charging: { pill: 'bg-blue-100 text-blue-700', bar: 'bg-blue-400' },
  soon: { pill: 'bg-amber-100 text-amber-700', bar: 'bg-amber-400' },
  ok: { pill: 'bg-emerald-100 text-emerald-700', bar: 'bg-emerald-400' },
  prepaid: { pill: 'bg-blue-100 text-blue-700', bar: 'bg-blue-300' },
  free: { pill: 'bg-slate-100 text-slate-600', bar: 'bg-slate-200' },
  unknown: { pill: 'bg-slate-100 text-slate-600', bar: 'bg-slate-300' },
};

// ─── Page ────────────────────────────────────────────────────────────────────

export default function SubscriptionsPage() {
  const { renewals, liveLoading, liveFailed } = useRenewals();
  const { totals, missing } = getMonthlyTotals(renewals);

  const problemCount = renewals.filter((r) => r.status === 'problem').length;
  const weekCount = renewals.filter((r) => r.daysLeft !== null && r.daysLeft <= REMINDER_DAYS).length;
  const monthCount = renewals.filter((r) => r.daysLeft !== null && r.daysLeft <= 30).length;

  return (
    <div className="p-6 md:p-8 space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl md:text-3xl font-bold text-[var(--color-brand-navy)] tracking-tight">
          Subscriptions
        </h1>
        <p className="text-sm text-[var(--color-text-muted)] mt-1">
          What each service costs, when it renews, and whether the last payment went through.
        </p>
      </div>

      {/* Monthly total */}
      <div className="rounded-xl border border-[var(--color-border-subtle)] bg-white shadow-sm p-6 flex flex-col sm:flex-row sm:items-end gap-4 sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">
            Monthly total
          </p>
          <p className="text-4xl font-extrabold text-[var(--color-brand-navy)] mt-1 tracking-tight">
            {totals.length === 0 ? '—' : totals.map(formatMoney).join(' + ')}
          </p>
          <p className="text-xs text-[var(--color-text-muted)] mt-1.5">
            Paid plans only, yearly plans divided by 12. Prepaid credit (Vapi, Twilio) is usage-based and not included.
          </p>
        </div>
        {missing > 0 && (
          <span className="self-start sm:self-auto text-xs font-semibold px-3 py-1.5 rounded-full bg-amber-100 text-amber-700">
            + {missing} plan{missing === 1 ? '' : 's'} without a price yet
          </span>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 md:gap-6">
        <StatTile color="rose" label="Needs attention" value={problemCount}>
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </StatTile>
        <StatTile color="blue" label={`Renewing in ${REMINDER_DAYS} days`} value={weekCount}>
          <polyline points="23 4 23 10 17 10" />
          <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
        </StatTile>
        <StatTile color="amber" label="Renewing in 30 days" value={monthCount}>
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
        </StatTile>
      </div>

      {liveFailed && (
        <p className="text-sm text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-4 py-3">
          The live billing checks could not run, so this page is showing the saved dates only.
        </p>
      )}

      {/* Subscription list */}
      <div className="rounded-xl border border-[var(--color-border-subtle)] bg-white shadow-sm overflow-hidden">
        <div className="divide-y divide-[var(--color-border-subtle)]">
          {renewals.map((r) => (
            <SubscriptionRow key={r.subscription.id} renewal={r} liveLoading={liveLoading} />
          ))}
        </div>
      </div>

      <p className="text-xs text-[var(--color-text-muted)]">
        Plans, prices and dates live in <code>src/config/subscriptions.ts</code>. Services marked Live are
        checked with the provider each time the hub is opened.
      </p>
    </div>
  );
}

// ─── Stat Tile ───────────────────────────────────────────────────────────────

const TILE_COLORS = {
  rose: { box: 'bg-rose-50/50 border-rose-100', icon: 'bg-rose-400/10 text-rose-400', label: 'text-rose-400', value: 'text-rose-500' },
  amber: { box: 'bg-amber-50/50 border-amber-100', icon: 'bg-amber-400/10 text-amber-400', label: 'text-amber-400', value: 'text-amber-500' },
  blue: { box: 'bg-blue-50/50 border-blue-100', icon: 'bg-blue-400/10 text-blue-400', label: 'text-blue-400', value: 'text-blue-500' },
} as const;

function StatTile({
  color,
  label,
  value,
  children,
}: {
  color: keyof typeof TILE_COLORS;
  label: string;
  value: number;
  children: React.ReactNode;
}) {
  const c = TILE_COLORS[color];
  return (
    <div className={`rounded-xl border-2 p-6 flex items-start gap-4 ${c.box}`}>
      <div className={`p-2.5 rounded-lg ${c.icon}`}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          {children}
        </svg>
      </div>
      <div>
        <p className={`text-sm font-semibold uppercase tracking-wider ${c.label}`}>{label}</p>
        <p className={`text-4xl font-extrabold mt-1 ${c.value}`}>{value}</p>
      </div>
    </div>
  );
}

// ─── Subscription Row ────────────────────────────────────────────────────────

function SubscriptionRow({ renewal, liveLoading }: { renewal: Renewal; liveLoading: boolean }) {
  const { subscription: s, nextDate, daysLeft, renewedDaysAgo, status, live } = renewal;
  const styles = STATUS_STYLES[status];
  const price = getPrice(renewal);

  return (
    <div className="relative p-5 flex flex-col md:flex-row gap-4 md:items-center hover:bg-[var(--color-bg-hover)] transition-colors">
      <div className={`absolute left-0 top-0 bottom-0 w-1 ${styles.bar}`} />

      {/* Name, live status, what breaks */}
      <div className="flex-1 min-w-0 pl-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold text-[var(--color-brand-navy)]">{s.name}</span>
          {s.plan && <span className="text-xs text-[var(--color-text-muted)]">{s.plan}</span>}
          {s.live && <LiveBadge renewal={renewal} loading={liveLoading} />}
        </div>

        {live?.checked && live.problem && (
          <p className="text-sm font-medium text-rose-700 mt-1.5">{live.problem}</p>
        )}
        {live?.checked && live.detail && (
          <p className="text-xs text-[var(--color-text-muted)] mt-1">{live.detail}</p>
        )}

        <p className="text-sm text-[var(--color-text-secondary)] mt-1 leading-relaxed">
          <span className="font-medium">If it lapses:</span> {s.breaks}
        </p>
        {renewedDaysAgo !== null && (
          <p className="text-xs text-amber-700 mt-1">
            Renewed {renewedDaysAgo === 0 ? 'today' : `${renewedDaysAgo} day${renewedDaysAgo === 1 ? '' : 's'} ago`}.
            Check the payment went through.
          </p>
        )}
      </div>

      {/* Price + countdown + billing link */}
      <div className="flex items-center gap-5 md:justify-end flex-shrink-0">
        <div className="w-28 text-left md:text-right">
          {s.cycle === 'free' ? (
            <p className="text-base font-bold text-[var(--color-text-secondary)]">Free</p>
          ) : s.cycle === 'prepaid' ? (
            <p className="text-sm font-semibold text-[var(--color-text-secondary)]">Pay as you go</p>
          ) : price ? (
            <>
              <p className="text-base font-bold text-[var(--color-brand-navy)]">{formatMoney(price)}</p>
              <p className="text-xs text-[var(--color-text-muted)]">per {s.cycle === 'yearly' ? 'year' : 'month'}</p>
            </>
          ) : (
            <p className="text-sm font-medium text-amber-700">Price needed</p>
          )}
        </div>

        <div className="w-36 text-left md:text-right">
          <CountdownPill status={status} daysLeft={daysLeft} pillClass={styles.pill} />
          <p className="text-xs text-[var(--color-text-muted)] mt-1">
            {nextDate
              ? `Renews ${format(nextDate, 'EEE d MMM yyyy')}`
              : status === 'prepaid'
                ? 'Stops when credit runs out'
                : status === 'free'
                  ? 'Nothing to pay'
                  : status === 'unknown'
                    ? 'Add it to the config'
                    : ''}
          </p>
        </div>

        <a
          href={s.billingUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="px-3 py-2 min-h-[40px] inline-flex items-center rounded-lg text-sm font-medium border border-[var(--color-border-default)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-secondary)] hover:text-[var(--color-brand-navy)] transition-colors"
        >
          Billing
        </a>
      </div>
    </div>
  );
}

function CountdownPill({
  status,
  daysLeft,
  pillClass,
}: {
  status: Renewal['status'];
  daysLeft: number | null;
  pillClass: string;
}) {
  let label: string;
  if (status === 'problem') label = 'Action needed';
  else if (daysLeft !== null && status === 'charging')
    label = `Auto-pays ${daysLeft > 1 ? `in ${daysLeft} days` : formatDaysLeft(daysLeft).toLowerCase()}`;
  else if (daysLeft !== null) label = formatDaysLeft(daysLeft);
  else if (status === 'prepaid') label = 'Check balance';
  else if (status === 'free') label = 'Free plan';
  else label = 'Date needed';

  return <span className={`inline-block text-sm font-bold px-3 py-1 rounded-full ${pillClass}`}>{label}</span>;
}

function LiveBadge({ renewal, loading }: { renewal: Renewal; loading: boolean }) {
  const { live } = renewal;
  if (loading && !live) return <Skeleton className="h-4 w-12 rounded-full" />;
  if (live?.checked) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
        Live
      </span>
    );
  }
  return (
    <span
      className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-slate-100 text-slate-500"
      title={live && !live.checked ? live.reason : undefined}
    >
      Live check unavailable{live && !live.checked ? `: ${live.reason}` : ''}
    </span>
  );
}
