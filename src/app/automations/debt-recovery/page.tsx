'use client';

import { useState } from 'react';
import { api } from '@/trpc/react';
import { StatsCard } from '@/components/dashboard/StatsCard';
import { ClientTable } from '@/components/dashboard/ClientTable';
import { ClientDetailDrawer } from '@/components/dashboard/ClientDetailDrawer';
import { SyncButton } from '@/components/dashboard/SyncButton';

export default function DebtRecoveryPage() {
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);

  const { data: clients, isLoading: clientsLoading } = api.clients.getAll.useQuery({});
  const { data: stats, isLoading: statsLoading } = api.clients.getStats.useQuery();

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 }).format(amount);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-text-primary)] tracking-tight">Debt Recovery</h1>
          <p className="text-sm text-[var(--color-text-muted)] mt-1">Manage and track client balances</p>
        </div>
        <SyncButton />
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          <StatsCard
            title="Total Outstanding"
            value={formatCurrency(stats.totalOutstanding)}
            subtitle="Across all clients"
            icon={
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
              </svg>
            }
          />
          <StatsCard
            title="Total Clients"
            value={stats.totalClients}
            subtitle="With balances"
            icon={
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
              </svg>
            }
          />
          <StatsCard
            title="At Risk"
            value={stats.atRisk}
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
            title="Suspended"
            value={stats.suspended}
            subtitle="3+ weeks overdue"
            icon={
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
              </svg>
            }
          />
          <StatsCard
            title="Collection Rate"
            value={`${stats.collectionRate.toFixed(1)}%`}
            subtitle="This month"
            trend={{ value: '+5.2%', positive: true }}
            icon={
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
              </svg>
            }
          />
        </div>
      )}

      {/* Loading state for stats */}
      {statsLoading && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-32 rounded-2xl bg-[var(--color-bg-elevated)] animate-pulse" />
          ))}
        </div>
      )}

      {/* Client Table */}
      <div>
        <h2 className="text-lg font-semibold text-[var(--color-text-primary)] mb-1">Clients</h2>
        <p className="text-sm text-[var(--color-text-muted)] mb-4">Manage and track client balances</p>

        {clientsLoading ? (
          <div className="h-96 rounded-2xl bg-[var(--color-bg-elevated)] animate-pulse" />
        ) : clients ? (
          <ClientTable clients={clients} onClientClick={setSelectedClientId} />
        ) : null}
      </div>

      {/* Client Detail Drawer */}
      <ClientDetailDrawer
        clientId={selectedClientId}
        onClose={() => setSelectedClientId(null)}
      />
    </div>
  );
}
