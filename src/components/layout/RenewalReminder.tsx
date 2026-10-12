/**
 * RenewalReminder
 * Pop-up shown over any /automations page when a subscription needs attention:
 * a live billing check found a failed payment, low balance or usage limit, or
 * a manually paid plan renews within REMINDER_DAYS. Auto-paid renewals don't
 * trigger it; they show as a heads-up on the Subscriptions page instead.
 *
 * Mounting it is what runs the live checks when the hub is opened. It appears
 * once per browser-tab session; closing it keeps it hidden until the hub is
 * opened again.
 */
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import { formatDaysLeft, formatMoney, getPrice, needsAttention } from '@/lib/subscriptions';
import { useRenewals } from '@/components/modules/subscriptions/useRenewals';

const DISMISSED_KEY = 'aiit:renewal-reminder-dismissed';

export function RenewalReminder() {
  // null until mounted, so server and client render match
  const [dismissed, setDismissed] = useState<boolean | null>(null);

  useEffect(() => {
    try {
      setDismissed(sessionStorage.getItem(DISMISSED_KEY) === '1');
    } catch {
      // Storage blocked: just show the reminder
      setDismissed(false);
    }
  }, []);

  const { renewals, liveLoading } = useRenewals({ enabled: dismissed === false });

  const close = () => {
    try {
      sessionStorage.setItem(DISMISSED_KEY, '1');
    } catch {
      // Storage blocked: it will show again on the next page load
    }
    setDismissed(true);
  };

  // Wait for the live checks so a failed payment isn't missed by showing early
  if (dismissed !== false || liveLoading) return null;
  const due = renewals.filter(needsAttention);
  if (due.length === 0) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-[60] backdrop-blur-[1px]" onClick={close} aria-hidden />
      <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 pointer-events-none">
        <div
          role="alertdialog"
          aria-labelledby="renewal-reminder-title"
          className="pointer-events-auto bg-white rounded-2xl shadow-xl border border-[var(--color-border-subtle)] w-full max-w-md p-6 space-y-4"
        >
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-rose-400/10 text-rose-500 flex-shrink-0">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <h3 id="renewal-reminder-title" className="text-sm font-semibold text-[var(--color-text-primary)]">
                {due.length === 1 ? 'A subscription needs attention' : `${due.length} subscriptions need attention`}
              </h3>
              <p className="text-xs text-[var(--color-text-muted)] mt-1 leading-relaxed">
                Sort these out or the automations that use them will stop.
              </p>
            </div>
            <button
              type="button"
              onClick={close}
              className="p-1.5 -mr-1.5 -mt-1.5 rounded-lg text-[var(--color-text-faint)] hover:text-[var(--color-text-primary)] hover:bg-gray-100 transition-colors"
              aria-label="Close"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          <ul className="divide-y divide-[var(--color-border-subtle)] rounded-xl border border-[var(--color-border-subtle)]">
            {due.map((r) => {
              const { subscription: s, nextDate, daysLeft, live } = r;
              const price = getPrice(r);
              return (
                <li key={s.id} className="p-3 flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-[var(--color-brand-navy)]">
                      {s.name}
                      {price && (
                        <span className="ml-1.5 text-xs font-normal text-[var(--color-text-muted)]">{formatMoney(price)}</span>
                      )}
                    </p>
                    <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
                      {live?.checked && live.problem
                        ? live.problem
                        : nextDate && `Due ${format(nextDate, 'EEE d MMM')}`}
                    </p>
                  </div>
                  <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-rose-100 text-rose-700 flex-shrink-0">
                    {r.status === 'problem' ? 'Action needed' : daysLeft !== null && formatDaysLeft(daysLeft)}
                  </span>
                  <a
                    href={s.billingUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-medium text-blue-600 hover:underline flex-shrink-0 pt-1"
                  >
                    Fix
                  </a>
                </li>
              );
            })}
          </ul>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={close}
              className="flex-1 py-2.5 rounded-lg border border-[var(--color-border-default)] text-sm font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)] transition"
            >
              Close
            </button>
            <Link
              href="/automations/subscriptions"
              onClick={close}
              className="flex-1 py-2.5 rounded-lg bg-[#50a1fe] hover:bg-[#3d8ee8] text-sm font-semibold text-white text-center transition"
            >
              View subscriptions
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
