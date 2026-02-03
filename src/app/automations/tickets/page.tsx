'use client';

import { useState } from 'react';
import { api } from '@/trpc/react';
import { TicketList } from '@/components/modules/tickets/TicketList';
import { TicketDetail } from '@/components/modules/tickets/TicketDetail';
import type { TicketStatus } from '@/types/tickets';

export default function TicketsPage() {
  const [statusFilter, setStatusFilter] = useState<TicketStatus | 'all'>('all');
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [showWorkers, setShowWorkers] = useState(false);
  const [newWorkerName, setNewWorkerName] = useState('');

  const { data: tickets, isLoading } = api.tickets.getAll.useQuery({
    status: statusFilter,
  }, {
    retry: false,
  });

  const { data: stats } = api.tickets.getStats.useQuery(undefined, {
    retry: false,
  });

  const { data: workers } = api.workers.getAll.useQuery();
  const utils = api.useUtils();

  const createWorkerMutation = api.workers.create.useMutation({
    onSuccess: () => {
      setNewWorkerName('');
      void utils.workers.getAll.invalidate();
    },
  });

  const deleteWorkerMutation = api.workers.delete.useMutation({
    onSuccess: () => void utils.workers.getAll.invalidate(),
  });

  return (
    <div className="p-6 md:p-8 space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl md:text-3xl font-bold text-[var(--color-brand-navy)] tracking-tight">IT Support Tickets</h1>
        <p className="text-sm text-[var(--color-text-muted)] mt-1">Manage customer inquiries and support requests</p>
      </div>

      {/* Workers Management */}
      <div className="bg-white rounded-xl border border-[var(--color-border-subtle)]">
        <button
          onClick={() => setShowWorkers(!showWorkers)}
          className="w-full flex items-center justify-between p-4 text-sm font-medium text-[var(--color-text-secondary)]"
        >
          <span>Manage Workers ({workers?.length ?? 0})</span>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`transition-transform ${showWorkers ? 'rotate-180' : ''}`}>
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
        {showWorkers && (
          <div className="px-4 pb-4 space-y-3">
            <div className="flex gap-2">
              <input
                type="text"
                value={newWorkerName}
                onChange={(e) => setNewWorkerName(e.target.value)}
                placeholder="Worker name"
                className="flex-1 px-3 py-1.5 rounded-lg border border-[var(--color-border-default)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-brand-orange)]"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newWorkerName.trim()) {
                    createWorkerMutation.mutate({ name: newWorkerName.trim() });
                  }
                }}
              />
              <button
                onClick={() => newWorkerName.trim() && createWorkerMutation.mutate({ name: newWorkerName.trim() })}
                disabled={createWorkerMutation.isPending || !newWorkerName.trim()}
                className="px-4 py-1.5 rounded-lg bg-[var(--color-brand-orange)] text-white text-sm font-medium hover:bg-[var(--color-accent-hover)] disabled:opacity-50"
              >
                Add
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {workers?.map((w) => (
                <span key={w.id} className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-gray-100 text-sm text-[var(--color-text-secondary)]">
                  {w.name}
                  <button
                    onClick={() => deleteWorkerMutation.mutate({ id: w.id })}
                    className="text-[var(--color-text-faint)] hover:text-red-500"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
        <div className="bg-white rounded-xl border border-[var(--color-border-subtle)] p-6">
          <p className="text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wider">Open</p>
          <p className="text-3xl font-bold text-[var(--color-brand-orange)] mt-2">{stats?.open ?? 0}</p>
        </div>
        <div className="bg-white rounded-xl border border-[var(--color-border-subtle)] p-6">
          <p className="text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wider">In Progress</p>
          <p className="text-3xl font-bold text-amber-600 mt-2">{stats?.inProgress ?? 0}</p>
        </div>
        <div className="bg-white rounded-xl border border-[var(--color-border-subtle)] p-6">
          <p className="text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wider">Resolved</p>
          <p className="text-3xl font-bold text-emerald-600 mt-2">{stats?.resolved ?? 0}</p>
        </div>
        <div className="bg-white rounded-xl border border-[var(--color-border-subtle)] p-6">
          <p className="text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wider">Avg Resolution</p>
          <p className="text-3xl font-bold text-[var(--color-brand-navy)] mt-2">{stats?.avgResolutionHours ?? 0}h</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-[var(--color-border-subtle)] p-4">
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-[var(--color-text-secondary)]">Filter:</span>
          <div className="flex gap-2">
            {(['all', 'open', 'in-progress', 'resolved'] as const).map((status) => (
              <button
                key={status}
                onClick={() => setStatusFilter(status)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  statusFilter === status
                    ? 'bg-[var(--color-brand-orange)] text-white'
                    : 'bg-gray-100 text-[var(--color-text-secondary)] hover:bg-gray-200'
                }`}
              >
                {status.charAt(0).toUpperCase() + status.slice(1).replace('-', ' ')}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Tickets List */}
      <div className="bg-white rounded-xl border border-[var(--color-border-subtle)]">
        <TicketList
          tickets={tickets ?? []}
          loading={isLoading}
          onTicketClick={(id) => setSelectedTicketId(id)}
        />
      </div>

      {/* Ticket Detail Modal */}
      {selectedTicketId && (
        <TicketDetail
          ticketId={selectedTicketId}
          onClose={() => setSelectedTicketId(null)}
        />
      )}
    </div>
  );
}
