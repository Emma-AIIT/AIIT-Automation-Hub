'use client';

import { useState } from 'react';
import { api } from '@/trpc/react';
import { TicketList } from '@/components/modules/tickets/TicketList';
import { TicketDetail } from '@/components/modules/tickets/TicketDetail';
import type { TicketStatus } from '@/types/tickets';

export default function TicketsPage() {
  const [statusFilter, setStatusFilter] = useState<TicketStatus | 'all'>('all');
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);

  const { data: tickets, isLoading } = api.tickets.getAll.useQuery({
    status: statusFilter,
  }, {
    retry: false,
  });

  const { data: stats } = api.tickets.getStats.useQuery(undefined, {
    retry: false,
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
        <div className="bg-white rounded-xl border border-[var(--color-border-subtle)] p-6">
          <p className="text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wider">Open</p>
          <p className="text-3xl font-bold text-[var(--color-brand-orange)] mt-2">{stats?.open ?? 0}</p>
        </div>
        <div className="bg-white rounded-xl border border-[var(--color-border-subtle)] p-6">
          <p className="text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wider">In Progress</p>
          <p className="text-3xl font-bold text-blue-600 mt-2">{stats?.inProgress ?? 0}</p>
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
