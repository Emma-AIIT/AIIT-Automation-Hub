'use client';

import { type FC, memo, useState, useCallback } from 'react';
import { format, differenceInDays } from 'date-fns';
import toast from 'react-hot-toast';
import { api } from '@/trpc/react';
import { getWorkerColor } from '@/lib/worker-colors';
import type { SupportTicket, TicketStatus } from '@/types/tickets';

interface Worker {
  id: string;
  name: string;
}

interface TicketListProps {
  tickets: SupportTicket[];
  loading: boolean;
  workers: Worker[];
  statusFilter: TicketStatus | 'all';
  onTicketClick: (id: string) => void;
  onMutationComplete?: (ticketId: string) => void;
}

const getOpenAgeBorderColor = (createdAt: string) => {
  const days = differenceInDays(new Date(), new Date(createdAt));
  if (days <= 1) return 'border-l-4 border-l-emerald-500'; // Green: 0-1 days
  if (days === 2) return 'border-l-4 border-l-yellow-500'; // Yellow: 2 days
  return 'border-l-4 border-l-red-500'; // Red: 3+ days
};

const getStatusColor = (status: string) => {
  switch (status) {
    case 'open': return 'bg-[var(--color-accent-light)] text-[var(--color-brand-orange)]';
    case 'in-progress': return 'bg-amber-50 text-amber-700';
    case 'resolved': return 'bg-emerald-50 text-emerald-700';
    default: return 'bg-gray-100 text-gray-700';
  }
};

const PriorityDisplay: FC<{ priority: string | null }> = ({ priority }) => {
  if (priority === 'high') {
    return (
      <div className="flex items-center gap-0.5 text-red-600" title="High Priority">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M14.4 6L14 4H5v17h2v-7h5.6l.4 2h7V6z"/></svg>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M14.4 6L14 4H5v17h2v-7h5.6l.4 2h7V6z"/></svg>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M14.4 6L14 4H5v17h2v-7h5.6l.4 2h7V6z"/></svg>
      </div>
    );
  }
  if (priority === 'low') {
    return (
      <div className="flex items-center text-blue-600" title="Low Priority">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M14.4 6L14 4H5v17h2v-7h5.6l.4 2h7V6z"/></svg>
      </div>
    );
  }
  return <span className="text-gray-400">—</span>;
};

const STATUS_OPTIONS: TicketStatus[] = ['open', 'in-progress', 'resolved'];

interface TicketRowProps {
  ticket: SupportTicket;
  workers: Worker[];
  openStatusId: string | null;
  onOpenStatusToggle: (ticketId: string) => void;
  updateStatusPending: boolean;
  assignPending: boolean;
  deletePending: boolean;
  onTicketClick: (id: string) => void;
  onStatusSelect: (ticketId: string, status: TicketStatus) => void;
  onAssignChange: (ticketId: string, assignedTo: string | null) => void;
  onDelete: (e: React.MouseEvent, ticketId: string) => void;
}

const TicketRow = memo(function TicketRow({
  ticket,
  workers,
  openStatusId,
  onOpenStatusToggle,
  updateStatusPending,
  assignPending,
  deletePending,
  onTicketClick,
  onStatusSelect,
  onAssignChange,
  onDelete,
}: TicketRowProps) {
  const assignedTo = ticket.assigned_to ?? '';
  const color = assignedTo ? getWorkerColor(assignedTo) : null;
  const isStatusOpen = openStatusId === ticket.id;

  return (
    <tr
      onClick={() => onTicketClick(ticket.id)}
      className={`border-b border-[var(--color-border-subtle)] last:border-b-0 hover:bg-gray-50 cursor-pointer transition-colors ${
        ticket.status === 'open' ? getOpenAgeBorderColor(ticket.created_at) : ''
      }`}
    >
      <td className="py-3 px-4 text-sm text-[var(--color-text-primary)]">
        {format(new Date(ticket.created_at), 'dd MMM yyyy, h:mm a')}
      </td>
      <td className="py-3 px-4">
        <PriorityDisplay priority={ticket.priority} />
      </td>
      <td className="py-3 px-4 text-sm font-medium text-[var(--color-text-primary)]">
        {ticket.caller_name}
      </td>
      <td className="py-3 px-4 text-sm text-[var(--color-text-muted)]">
        {ticket.caller_business ?? '-'}
      </td>
      <td className="py-3 px-4 text-sm text-[var(--color-text-primary)] max-w-xs truncate">
        {ticket.inquiry}
      </td>
      <td className="py-3 px-4" onClick={(e) => e.stopPropagation()}>
        <select
          value={assignedTo}
          onChange={(e) => onAssignChange(ticket.id, e.target.value || null)}
          disabled={assignPending}
          className={`w-full max-w-[140px] px-2 py-1 text-sm rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-brand-orange)] focus:border-transparent font-medium ${
            color ? `border-l-4 border ${color.bg} ${color.text} ${color.border}` : 'border border-[var(--color-border-default)] bg-white'
          }`}
        >
          <option value="">—</option>
          {workers.map((w) => (
            <option key={w.id} value={w.name}>
              {w.name}
            </option>
          ))}
        </select>
      </td>
      <td className="py-3 px-4 relative" onClick={(e) => e.stopPropagation()}>
        <div className="relative">
          <button
            type="button"
            onClick={() => onOpenStatusToggle(ticket.id)}
            disabled={updateStatusPending}
            className={`inline-flex px-2 py-1 rounded-md text-xs font-medium transition-colors hover:opacity-90 ${getStatusColor(ticket.status)}`}
          >
            {ticket.status.replace('-', ' ')}
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="ml-1 inline">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
          {isStatusOpen && (
            <>
              <div
                className="fixed inset-0 z-10"
                aria-hidden
                onClick={() => onOpenStatusToggle(ticket.id)}
              />
              <div className="absolute left-0 top-full mt-1 z-20 min-w-[140px] rounded-lg border border-[var(--color-border-subtle)] bg-white shadow-lg py-1">
                {STATUS_OPTIONS.map((status) => (
                  <button
                    key={status}
                    type="button"
                    onClick={() => onStatusSelect(ticket.id, status)}
                    className={`block w-full text-left px-3 py-2 text-sm hover:bg-gray-50 first:rounded-t-lg last:rounded-b-lg ${
                      ticket.status === status ? 'bg-[var(--color-accent-light)] text-[var(--color-brand-orange)] font-medium' : 'text-[var(--color-text-secondary)]'
                    }`}
                  >
                    {status.replace('-', ' ')}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </td>
      <td className="py-3 px-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => onTicketClick(ticket.id)}
            className="text-sm text-[var(--color-brand-orange)] hover:underline font-medium"
          >
            View
          </button>
          <button
            type="button"
            onClick={(e) => onDelete(e, ticket.id)}
            disabled={deletePending}
            className="text-sm text-red-600 hover:text-red-700 hover:underline font-medium disabled:opacity-50"
          >
            Delete
          </button>
        </div>
      </td>
    </tr>
  );
});

export const TicketList: FC<TicketListProps> = memo(function TicketList({
  tickets,
  loading,
  workers,
  statusFilter,
  onTicketClick,
  onMutationComplete,
}) {
  const [openStatusId, setOpenStatusId] = useState<string | null>(null);
  const utils = api.useUtils();

  const updateStatusMutation = api.tickets.updateStatus.useMutation({
    onMutate: async ({ id, status }) => {
      await utils.tickets.getAll.cancel({ status: statusFilter });
      const prev = utils.tickets.getAll.getData({ status: statusFilter });
      utils.tickets.getAll.setData({ status: statusFilter }, (old) => {
        if (!old) return old;
        if (status !== statusFilter && statusFilter !== 'all') {
          return old.filter((t) => t.id !== id);
        }
        return old.map((t) =>
          t.id === id
            ? {
                ...t,
                status,
                resolved_at: status === 'resolved' ? new Date().toISOString() : null,
              }
            : t
        );
      });
      void utils.tickets.getStats.invalidate();
      setOpenStatusId(null);
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) {
        utils.tickets.getAll.setData({ status: statusFilter }, ctx.prev);
      }
    },
    onSettled: (_data, _err, vars) => {
      onMutationComplete?.(vars.id);
      void utils.tickets.getAll.invalidate({ status: statusFilter });
      void utils.tickets.getStats.invalidate();
    },
  });

  const deleteMutation = api.tickets.delete.useMutation({
    onMutate: async ({ id }) => {
      await utils.tickets.getAll.cancel({ status: statusFilter });
      await utils.tickets.getStats.cancel();
      const prevTickets = utils.tickets.getAll.getData({ status: statusFilter });
      const prevStats = utils.tickets.getStats.getData();

      const ticket = prevTickets?.find((t) => t.id === id);
      const wasOpenUnassigned =
        ticket?.status === 'open' &&
        (!ticket.assigned_to || String(ticket.assigned_to).trim() === '');

      utils.tickets.getAll.setData({ status: statusFilter }, (old) =>
        old ? old.filter((t) => t.id !== id) : old
      );

      if (prevStats && ticket) {
        const updates: Record<string, number> = {
          total: Math.max(0, prevStats.total - 1),
          open: ticket.status === 'open' ? Math.max(0, prevStats.open - 1) : prevStats.open,
          inProgress: ticket.status === 'in-progress' ? Math.max(0, prevStats.inProgress - 1) : prevStats.inProgress,
          resolved: ticket.status === 'resolved' ? Math.max(0, prevStats.resolved - 1) : prevStats.resolved,
          unassigned: wasOpenUnassigned ? Math.max(0, prevStats.unassigned - 1) : prevStats.unassigned,
        };
        utils.tickets.getStats.setData(undefined, { ...prevStats, ...updates });
      }

      return { prevTickets, prevStats };
    },
    onError: (err, _vars, ctx) => {
      if (ctx?.prevTickets) {
        utils.tickets.getAll.setData({ status: statusFilter }, ctx.prevTickets);
      }
      if (ctx?.prevStats) {
        utils.tickets.getStats.setData(undefined, ctx.prevStats);
      }
      toast.error(err.message ?? 'Failed to delete ticket');
    },
    onSuccess: () => {
      void utils.tickets.getAll.invalidate({ status: statusFilter });
      void utils.tickets.getStats.invalidate();
    },
  });

  const assignWorkerMutation = api.tickets.assignWorker.useMutation({
    onMutate: async ({ id, assigned_to }) => {
      await utils.tickets.getAll.cancel({ status: statusFilter });
      await utils.tickets.getStats.cancel();
      const prevTickets = utils.tickets.getAll.getData({ status: statusFilter });
      const prevStats = utils.tickets.getStats.getData();

      const ticket = prevTickets?.find((t) => t.id === id);
      const wasOpenUnassigned =
        ticket?.status === 'open' &&
        (!ticket.assigned_to || String(ticket.assigned_to).trim() === '');
      const isNowUnassigned = !assigned_to || String(assigned_to).trim() === '';

      utils.tickets.getAll.setData({ status: statusFilter }, (old) =>
        old ? old.map((t) => (t.id === id ? { ...t, assigned_to } : t)) : old
      );

      if (prevStats && ticket?.status === 'open') {
        let unassignedDelta = 0;
        if (wasOpenUnassigned && !isNowUnassigned) unassignedDelta = -1;
        else if (!wasOpenUnassigned && isNowUnassigned) unassignedDelta = 1;
        if (unassignedDelta !== 0) {
          utils.tickets.getStats.setData(undefined, {
            ...prevStats,
            unassigned: Math.max(0, prevStats.unassigned + unassignedDelta),
          });
        }
      }

      return { prevTickets, prevStats };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prevTickets) {
        utils.tickets.getAll.setData({ status: statusFilter }, ctx.prevTickets);
      }
      if (ctx?.prevStats) {
        utils.tickets.getStats.setData(undefined, ctx.prevStats);
      }
    },
    onSettled: (_data, _err, vars) => {
      onMutationComplete?.(vars.id);
      void utils.tickets.getAll.invalidate({ status: statusFilter });
      void utils.tickets.getStats.invalidate();
    },
  });

  const handleStatusSelect = useCallback(
    (ticketId: string, status: TicketStatus) => {
      updateStatusMutation.mutate({ id: ticketId, status });
    },
    [updateStatusMutation]
  );

  const handleAssignChange = useCallback(
    (ticketId: string, assignedTo: string | null) => {
      assignWorkerMutation.mutate({ id: ticketId, assigned_to: assignedTo || null });
    },
    [assignWorkerMutation]
  );

  const handleDelete = useCallback(
    (e: React.MouseEvent, ticketId: string) => {
      e.stopPropagation();
      if (window.confirm('Delete this ticket? This cannot be undone.')) {
        deleteMutation.mutate({ id: ticketId });
      }
    },
    [deleteMutation]
  );

  if (loading) {
    return <div className="p-8 text-center text-[var(--color-text-muted)]">Loading tickets...</div>;
  }

  if (tickets.length === 0) {
    return (
      <div className="p-8 text-center">
        <p className="text-[var(--color-text-muted)]">No tickets found</p>
        <p className="text-xs text-[var(--color-text-faint)] mt-1">Tickets will appear here when created via VAPI or the webhook API</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-[var(--color-border-subtle)]">
            <th className="text-left py-3 px-4 text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wider">Created</th>
            <th className="text-left py-3 px-4 text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wider">Priority</th>
            <th className="text-left py-3 px-4 text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wider">Customer</th>
            <th className="text-left py-3 px-4 text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wider">Business</th>
            <th className="text-left py-3 px-4 text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wider">Inquiry</th>
            <th className="text-left py-3 px-4 text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wider">Assigned To</th>
            <th className="text-left py-3 px-4 text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wider">Status</th>
            <th className="text-left py-3 px-4 text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wider">Actions</th>
          </tr>
        </thead>
        <tbody>
          {tickets.map((ticket) => (
            <TicketRow
              key={ticket.id}
              ticket={ticket}
              workers={workers}
              openStatusId={openStatusId}
              onOpenStatusToggle={(id) => setOpenStatusId((current) => (current === id ? null : id))}
              updateStatusPending={updateStatusMutation.isPending}
              assignPending={assignWorkerMutation.isPending}
              deletePending={deleteMutation.isPending}
              onTicketClick={onTicketClick}
              onStatusSelect={handleStatusSelect}
              onAssignChange={handleAssignChange}
              onDelete={handleDelete}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
});
