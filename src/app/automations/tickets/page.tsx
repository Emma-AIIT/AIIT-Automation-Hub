'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { keepPreviousData } from '@tanstack/react-query';
import { api } from '@/trpc/react';
import { getWorkerColor } from '@/lib/worker-colors';
import { createClient } from '@/lib/supabase/client';
import toast from 'react-hot-toast';
import { TicketList } from '@/components/modules/tickets/TicketList';
import { TicketDetail } from '@/components/modules/tickets/TicketDetail';
import { CreateTicketModal } from '@/components/modules/tickets/CreateTicketModal';
import type { TicketStatus } from '@/types/tickets';

export default function TicketsPage() {
  const [statusFilter, setStatusFilter] = useState<TicketStatus | 'all'>('all');
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [showWorkers, setShowWorkers] = useState(false);
  const [newWorkerName, setNewWorkerName] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);

  const { data: tickets, isLoading } = api.tickets.getAll.useQuery(
    { status: statusFilter },
    {
      retry: false,
      placeholderData: keepPreviousData,
      staleTime: 30 * 1000,
    }
  );

  const { data: stats } = api.tickets.getStats.useQuery(undefined, {
    retry: false,
    staleTime: 30 * 1000,
  });

  const { data: workers } = api.workers.getAll.useQuery();
  const utils = api.useUtils();
  const channelRef = useRef<ReturnType<ReturnType<typeof createClient>['channel']> | null>(null);

  const handleMutationComplete = useCallback(
    (ticketId: string) => {
      if (selectedTicketId === ticketId) {
        void utils.tickets.getById.invalidate({ id: ticketId });
      }
    },
    [selectedTicketId, utils.tickets.getById]
  );

  const pullNewMutation = api.tickets.pullNew.useMutation({
    onMutate: () => {
      toast.loading('Pulling new tickets...', { id: 'pull-tickets' });
    },
    onSuccess: (data) => {
      toast.dismiss('pull-tickets');
      const count = data.tickets_processed;
      if (count === 0) {
        toast('No new tickets found', { id: 'pull-tickets-result', icon: 'ℹ️', duration: 5000 });
      } else if (typeof count !== 'number' || count <= 0) {
        toast.success(data.message ?? 'Pull complete', { id: 'pull-tickets-result' });
      }
      void utils.tickets.getAll.invalidate({ status: statusFilter });
      void utils.tickets.getStats.invalidate();
    },
    onError: (err) => {
      toast.dismiss('pull-tickets');
      toast.error(err.message ?? 'Failed to pull tickets.', { id: 'pull-tickets-result' });
    },
  });

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel('tickets-realtime')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'support_tickets',
        },
        () => {
          toast.dismiss('pull-tickets');
          void utils.tickets.getAll.invalidate({ status: statusFilter });
          void utils.tickets.getStats.invalidate();
        }
      )
      .subscribe();
    channelRef.current = channel;
    return () => {
      if (channelRef.current) {
        void supabase.removeChannel(channelRef.current);
      }
    };
  }, [statusFilter, utils]);

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
              {workers?.map((w) => {
                const color = getWorkerColor(w.name);
                return (
                <span
                  key={w.id}
                  className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium border ${color ? `${color.bg} ${color.text} ${color.border}` : 'bg-gray-100 text-[var(--color-text-secondary)] border-gray-200'}`}
                >
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
                );
              })}
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
          <p className="text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wider">Unassigned</p>
          <p className="text-3xl font-bold text-[var(--color-brand-navy)] mt-2">{stats?.unassigned ?? 0}</p>
        </div>
      </div>

      {/* Filters + Pull new tickets */}
      <div className="bg-white rounded-xl border border-[var(--color-border-subtle)] p-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
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
          <div className="flex flex-col items-end gap-1">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowCreateModal(true)}
                className="flex items-center gap-2 px-4 py-2 rounded-lg border border-[var(--color-border-default)] bg-white text-[var(--color-text-secondary)] text-sm font-medium hover:bg-[var(--color-bg-hover)] transition-colors"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                Create new ticket
              </button>
              <button
                onClick={() => pullNewMutation.mutate()}
                disabled={pullNewMutation.isPending}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--color-brand-navy)] text-white text-sm font-medium hover:bg-[var(--color-brand-navy)]/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
              {pullNewMutation.isPending ? (
                <>
                  <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
                    <path d="M21 3v5h-5" />
                  </svg>
                  Pulling...
                </>
              ) : (
                <>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                  Pull new tickets
                </>
              )}
              </button>
            </div>
            <p className="text-xs text-[var(--color-text-muted)] text-right whitespace-nowrap">
              Email tickets to{' '}
              <a href="mailto:aidev@allinit.com.au" className="text-[var(--color-brand-navy)] hover:underline">
                aidev@allinit.com.au
              </a>{' '}
              first.
            </p>
          </div>
        </div>
      </div>

      {/* Tickets List */}
      <div className="bg-white rounded-xl border border-[var(--color-border-subtle)]">
        <TicketList
          tickets={tickets ?? []}
          loading={isLoading}
          workers={workers ?? []}
          statusFilter={statusFilter}
          onTicketClick={(id) => setSelectedTicketId(id)}
          onMutationComplete={handleMutationComplete}
        />
      </div>

      {/* Create Ticket Modal */}
      <CreateTicketModal
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        workers={workers ?? []}
        onSuccess={() => setShowCreateModal(false)}
      />

      {/* Ticket Detail Modal */}
      {selectedTicketId && (
        <TicketDetail
          ticketId={selectedTicketId}
          onClose={() => setSelectedTicketId(null)}
          workers={workers ?? undefined}
        />
      )}
    </div>
  );
}
