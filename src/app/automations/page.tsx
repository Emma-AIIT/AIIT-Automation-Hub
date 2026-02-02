'use client';

import { api } from '@/trpc/react';
import { StatsCard } from '@/components/dashboard/StatsCard';
import { ActivityTimeline } from '@/components/dashboard/ActivityTimeline';
import { AgentStatusCards } from '@/components/dashboard/AgentStatusCards';
import { ModuleCard } from '@/components/dashboard/ModuleCard';

export default function AutomationsDashboardPage() {
  const { data: debtStats, isLoading: debtStatsLoading } = api.clients.getStats.useQuery();
  const { data: quoteData } = api.quotePipeline.getRows.useQuery();
  const quoteCount = quoteData?.quotes?.length ?? 0;
  const wonCount = quoteData?.quotes?.filter((q) => q.status === 'Won').length ?? 0;

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 }).format(amount);

  return (
    <div className="p-6 md:p-8 space-y-8 max-w-7xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-[var(--color-brand-navy)] tracking-tight">AI Operations Center</h1>
          <p className="text-sm text-[var(--color-text-muted)] mt-1">Welcome back, All In IT Solutions</p>
        </div>
      </div>

      {/* Top Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
        <StatsCard
          title="Active Agents"
          value={4}
          subtitle="VAPI voice agents"
          icon={
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
            </svg>
          }
        />
        <StatsCard
          title="Outstanding Debt"
          value={debtStats ? formatCurrency(debtStats.totalOutstanding) : debtStatsLoading ? '...' : '-'}
          subtitle={debtStats ? `${debtStats.totalClients} clients` : 'Debt Recovery'}
          icon={
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
            </svg>
          }
        />
        <StatsCard
          title="At Risk"
          value={debtStats?.atRisk ?? (debtStatsLoading ? '...' : '-')}
          subtitle="1-3 weeks overdue"
          icon={
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          }
        />
        <StatsCard
          title="Won Quotes"
          value={wonCount}
          subtitle={`${quoteCount} total quotes`}
          icon={
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          }
        />
      </div>

      {/* Main Grid - Activity Timeline + Quick Links */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <ActivityTimeline />
        </div>
        <div className="space-y-6">
          <AgentStatusCards />
        </div>
      </div>

      {/* Module Cards */}
      <div>
        <h2 className="text-lg font-semibold text-[var(--color-text-primary)] mb-1">Automations</h2>
        <p className="text-sm text-[var(--color-text-muted)] mb-4">Manage your automated workflows</p>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <ModuleCard
            title="Voice Agents"
            description="Manage VAPI assistants and call logs"
            icon={
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
              </svg>
            }
            stats={{ agents: 4 }}
            href="/automations/voice-agents"
          />
          <ModuleCard
            title="Debt Recovery"
            description="Track client balances and outreach"
            icon={
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
              </svg>
            }
            stats={{ outstanding: debtStats ? formatCurrency(debtStats.totalOutstanding) : '-' }}
            href="/automations/debt-recovery"
          />
          <ModuleCard
            title="Quote Pipeline"
            description="Convert leads to clients"
            icon={
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
            }
            stats={{ quotes: quoteCount, won: wonCount }}
            href="/automations/quote-pipeline"
          />
          <ModuleCard
            title="IT Support"
            description="Customer support tickets"
            icon={
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <path d="M3 9h18" />
                <path d="M3 15h18" />
              </svg>
            }
            stats={{ tickets: 0 }}
            href="/automations/tickets"
          />
        </div>
      </div>
    </div>
  );
}
