'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { keepPreviousData } from '@tanstack/react-query';
import { api } from '@/trpc/react';
import { getWorkerColor } from '@/lib/worker-colors';
import { createClient } from '@/lib/supabase/client';
import toast from 'react-hot-toast';
import { TicketList } from '@/components/modules/tickets/TicketList';
import { TicketDetail } from '@/components/modules/tickets/TicketDetail';
import { CreateTicketModal } from '@/components/modules/tickets/CreateTicketModal';
import { SkeletonStatsCard } from '@/components/ui/Skeleton';
import type { TicketStatus } from '@/types/tickets';

export default function TicketsPage() {
  const searchParams = useSearchParams();
  const idFromSearch = searchParams.get('id');
  const [statusFilter, setStatusFilter] = useState<TicketStatus | 'all' | 'unassigned'>(
    idFromSearch ? 'all' : 'open'
  );
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(idFromSearch);
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

  const { data: stats, isLoading: statsLoading } = api.tickets.getStats.useQuery(undefined, {
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

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
        {statsLoading ? (
          <>
            {[1, 2, 3, 4].map((i) => (
              <SkeletonStatsCard key={i} />
            ))}
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => setStatusFilter(statusFilter === 'open' ? 'all' : 'open')}
              className={`bg-blue-50/50 rounded-xl border-2 p-6 flex items-start gap-4 transition-all cursor-pointer text-left ${statusFilter === 'open' ? 'border-blue-400 ring-2 ring-blue-400/30' : 'border-blue-100 hover:border-blue-300'}`}
            >
              <div className="p-2.5 rounded-lg bg-blue-400/10">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-blue-400">
                  <circle cx="12" cy="12" r="10" />
                  <circle cx="12" cy="12" r="3" fill="currentColor" stroke="none" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-semibold text-blue-400 uppercase tracking-wider">Open</p>
                <p className="text-4xl font-extrabold text-blue-500 mt-1">{stats?.open ?? 0}</p>
              </div>
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter(statusFilter === 'in-progress' ? 'all' : 'in-progress')}
              className={`bg-amber-50/50 rounded-xl border-2 p-6 flex items-start gap-4 transition-all cursor-pointer text-left ${statusFilter === 'in-progress' ? 'border-amber-400 ring-2 ring-amber-400/30' : 'border-amber-100 hover:border-amber-300'}`}
            >
              <div className="p-2.5 rounded-lg bg-amber-400/10">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-amber-400">
                  <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-semibold text-amber-400 uppercase tracking-wider">In Progress</p>
                <p className="text-4xl font-extrabold text-amber-500 mt-1">{stats?.inProgress ?? 0}</p>
              </div>
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter(statusFilter === 'resolved' ? 'all' : 'resolved')}
              className={`bg-emerald-50/50 rounded-xl border-2 p-6 flex items-start gap-4 transition-all cursor-pointer text-left ${statusFilter === 'resolved' ? 'border-emerald-400 ring-2 ring-emerald-400/30' : 'border-emerald-100 hover:border-emerald-300'}`}
            >
              <div className="p-2.5 rounded-lg bg-emerald-400/10">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-emerald-400">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                  <polyline points="22 4 12 14.01 9 11.01" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-semibold text-emerald-400 uppercase tracking-wider">Resolved</p>
                <p className="text-4xl font-extrabold text-emerald-500 mt-1">{stats?.resolved ?? 0}</p>
              </div>
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter(statusFilter === 'unassigned' ? 'all' : 'unassigned')}
              className={`bg-slate-50/50 rounded-xl border-2 p-6 flex items-start gap-4 transition-all cursor-pointer text-left ${statusFilter === 'unassigned' ? 'border-slate-400 ring-2 ring-slate-400/30' : 'border-slate-100 hover:border-slate-300'}`}
            >
              <div className="p-2.5 rounded-lg bg-slate-400/10">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-slate-400">
                  <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <line x1="17" y1="8" x2="23" y2="14" />
                  <line x1="23" y1="8" x2="17" y2="14" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-400 uppercase tracking-wider">Unassigned</p>
                <p className="text-4xl font-extrabold text-slate-500 mt-1">{stats?.unassigned ?? 0}</p>
              </div>
            </button>
          </>
        )}
      </div>

      {/* Toolbar */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          {/* Workers toggle (left) */}
          <button
            onClick={() => setShowWorkers(!showWorkers)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition-colors ${showWorkers ? 'border-[var(--color-brand-orange)] bg-[var(--color-accent-light)] text-[var(--color-brand-orange)]' : 'border-[var(--color-border-default)] bg-white text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)]'}`}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <line x1="19" y1="8" x2="19" y2="14" />
              <line x1="22" y1="11" x2="16" y2="11" />
            </svg>
            Workers ({workers?.length ?? 0})
          </button>

          {/* Actions (right) */}
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
              Create ticket
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
        </div>

        {/* Workers panel (expandable) */}
        {showWorkers && (
          <div className="bg-white rounded-xl border border-[var(--color-border-subtle)] p-4 space-y-3">
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
