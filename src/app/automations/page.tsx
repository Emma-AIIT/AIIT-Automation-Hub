'use client';

import Link from 'next/link';
import { api } from '@/trpc/react';
import { SIDEBAR_MODULES } from '@/lib/mock-data/quotes';
import { StatsCard } from '@/components/dashboard/StatsCard';

export default function AutomationsDashboardPage() {
  const { data: debtStats, isLoading: debtStatsLoading } = api.clients.getStats.useQuery();
  const { data: quoteData } = api.quotePipeline.getRows.useQuery();
  const quoteCount = quoteData?.quotes?.length ?? 0;
  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 }).format(amount);

  const automationCards = [
    {
      id: 'debt-recovery',
      label: 'Debt Recovery',
      route: '/automations/debt-recovery',
      description: 'Manage and track client balances',
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
        </svg>
      ),
      stat: debtStats ? formatCurrency(debtStats.totalOutstanding) : debtStatsLoading ? '…' : '—',
      statLabel: 'Total Outstanding',
      active: true,
    },
    {
      id: 'quote-pipeline',
      label: 'Quote Pipeline',
      route: '/automations/quote-pipeline',
      description: 'Track and convert quotes from Google Sheets',
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
        </svg>
      ),
      stat: quoteCount,
      statLabel: 'quotes',
      active: true,
    },
    {
      id: 'lead-tracker',
      label: 'Lead Tracker',
      route: '#',
      description: 'Track leads and follow-ups',
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      ),
      stat: 'Soon',
      statLabel: 'Coming soon',
      active: false,
    },
  ];

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-[var(--color-text-primary)] tracking-tight">Overview</h1>
        <p className="text-sm text-[var(--color-text-muted)] mt-1">Your automations at a glance</p>
      </div>

      {/* Quick stats - same styling as debt recovery */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <StatsCard
          title="Debt outstanding"
          value={debtStats ? formatCurrency(debtStats.totalOutstanding) : debtStatsLoading ? '…' : '—'}
          subtitle={debtStats ? `${debtStats.totalClients} clients` : 'Debt Recovery'}
          icon={
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
            </svg>
          }
        />
        <StatsCard
          title="At risk (debt)"
          value={debtStats?.atRisk ?? (debtStatsLoading ? '…' : '—')}
          subtitle="1–3 weeks overdue"
          icon={
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          }
        />
        <StatsCard
          title="Won quotes"
          value={String(quoteData?.quotes?.filter((q) => q.status === 'Won').length ?? 0)}
          subtitle="Converted"
          icon={
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          }
        />
      </div>

      {/* Automation cards - link to each module */}
      <div>
        <h2 className="text-lg font-semibold text-[var(--color-text-primary)] mb-1">Automations</h2>
        <p className="text-sm text-[var(--color-text-muted)] mb-4">Open an automation to manage it</p>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {automationCards.map((card) => {
            const content = (
              <div
                className={`
                  group relative overflow-hidden rounded-2xl border p-5 transition-all duration-300
                  ${card.active
                    ? 'border-[var(--color-border-subtle)] bg-gradient-to-br from-[var(--color-bg-card)] to-[var(--color-bg-secondary)] hover:border-[var(--color-border-default)] hover:shadow-xl hover:shadow-black/20 cursor-pointer'
                    : 'border-[var(--color-border-subtle)] bg-[var(--color-bg-elevated)] opacity-75 cursor-default'
                  }
                `}
              >
                <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[var(--color-border-strong)] to-transparent opacity-50" />
                <div className="relative flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500/15 to-purple-500/10 border border-blue-500/10 flex items-center justify-center text-blue-400">
                      {card.icon}
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-sm font-semibold text-[var(--color-text-primary)] truncate">{card.label}</h3>
                      <p className="text-xs text-[var(--color-text-muted)] mt-0.5 line-clamp-2">{card.description}</p>
                    </div>
                  </div>
                  {card.active && (
                    <span className="flex-shrink-0 text-[var(--color-text-faint)] group-hover:translate-x-0.5 transition-transform">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="9 18 15 12 9 6" />
                      </svg>
                    </span>
                  )}
                </div>
                <div className="mt-4 pt-4 border-t border-[var(--color-border-subtle)]">
                  <div className="text-[10px] font-medium text-[var(--color-text-faint)] uppercase tracking-[0.1em]">{card.statLabel}</div>
                  <div className="text-lg font-bold text-[var(--color-text-primary)] tracking-tight mt-0.5">{card.stat}</div>
                </div>
                {!card.active && (
                  <div className="absolute inset-0 flex items-center justify-center bg-[var(--color-bg-card)]/60 rounded-2xl">
                    <span className="text-xs font-medium text-[var(--color-text-muted)] px-3 py-1.5 rounded-lg bg-[var(--color-bg-elevated)] border border-[var(--color-border-subtle)]">Coming soon</span>
                  </div>
                )}
              </div>
            );

            if (card.active) {
              return <Link key={card.id} href={card.route}>{content}</Link>;
            }
            return <div key={card.id}>{content}</div>;
          })}
        </div>
      </div>

      {/* Quick links matching sidebar */}
      <div className="pt-2">
        <h2 className="text-lg font-semibold text-[var(--color-text-primary)] mb-1">Quick links</h2>
        <p className="text-sm text-[var(--color-text-muted)] mb-4">Jump to an automation</p>
        <div className="flex flex-wrap gap-2">
          {SIDEBAR_MODULES.filter((m) => !m.disabled).map((mod) => (
            <Link
              key={mod.id}
              href={mod.route}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-bg-card)] text-sm font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)] hover:border-[var(--color-border-strong)] transition-colors"
            >
              {mod.label}
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                <polyline points="15 3 21 3 21 9" />
                <line x1="10" y1="14" x2="21" y2="3" />
              </svg>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
