'use client';

import { type FC, memo, useState, useCallback } from 'react';
import { format, differenceInDays } from 'date-fns';
import toast from 'react-hot-toast';
import { api } from '@/trpc/react';
import { getWorkerColor } from '@/lib/worker-colors';
import type { SupportTicket, TicketStatus, TicketSource } from '@/types/tickets';
import { SkeletonTable } from '@/components/ui/Skeleton';

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

/** Strip HTML tags for table display so inquiry column shows plain text only */
function inquiryPlainText(inquiry: string): string {
  if (!inquiry?.trim()) return '';
  const stripped = inquiry
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .trim();
  return stripped.replace(/\n+/g, ' ').trim();
}

const getStatusColor = (status: string) => {
  switch (status) {
    case 'open': return 'bg-[var(--color-accent-light)] text-[var(--color-brand-orange)]';
    case 'in-progress': return 'bg-amber-50 text-amber-700';
    case 'resolved': return 'bg-emerald-50 text-emerald-700';
    default: return 'bg-gray-100 text-gray-700';
  }
};

const SourceIcon: FC<{ source: TicketSource }> = ({ source }) => {
  const title = source === 'phone' ? 'Phone' : source === 'email' ? 'Email' : source === 'manual' ? 'Manual' : 'Walk-in';
  const color = source === 'phone' ? 'text-blue-600' : source === 'email' ? 'text-violet-600' : source === 'manual' ? 'text-gray-600' : 'text-amber-600';
  if (source === 'phone') {
    return (
      <span className={color} title={title}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
      </span>
    );
  }
  if (source === 'email') {
    return (
      <span className={color} title={title}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
      </span>
    );
  }
  if (source === 'manual') {
    return (
      <span className={color} title={title}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
      </span>
    );
  }
  return (
    <span className={color} title={title}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
    </span>
  );
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
  isSelected: boolean;
  onToggleSelect: (ticketId: string, checked: boolean) => void;
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
  isSelected,
  onToggleSelect,
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
      } ${isSelected ? 'bg-[var(--color-accent-light)]/30' : ''}`}
    >
      <td className="py-3 px-4 w-10" onClick={(e) => e.stopPropagation()}>
        <input
          type="checkbox"
          checked={isSelected}
          onChange={(e) => onToggleSelect(ticket.id, e.target.checked)}
          className="h-4 w-4 rounded border-[var(--color-border-default)] text-[var(--color-brand-orange)] focus:ring-[var(--color-brand-orange)]"
          aria-label={`Select ticket ${ticket.caller_name}`}
        />
      </td>
      <td className="py-3 px-4 text-sm text-[var(--color-text-primary)]">
        {format(new Date(ticket.created_at), 'dd MMM yyyy, h:mm a')}
      </td>
      <td className="py-3 px-4" title={ticket.source === 'phone' ? 'Phone' : ticket.source === 'email' ? 'Email' : ticket.source === 'manual' ? 'Manual' : 'Walk-in'}>
        <SourceIcon source={ticket.source ?? 'manual'} />
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
      <td className="py-3 px-4 text-sm text-[var(--color-text-primary)] max-w-xs truncate" title={inquiryPlainText(ticket.inquiry)}>
        {inquiryPlainText(ticket.inquiry)}
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
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const utils = api.useUtils();

  const toggleSelect = useCallback((ticketId: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(ticketId);
      else next.delete(ticketId);
      return next;
    });
  }, []);

  const selectAll = useCallback(
    (checked: boolean) => {
      if (checked) setSelectedIds(new Set(tickets.map((t) => t.id)));
      else setSelectedIds(new Set());
    },
    [tickets]
  );

  const allSelected = tickets.length > 0 && selectedIds.size === tickets.length;
  const someSelected = selectedIds.size > 0;

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

  const deleteManyMutation = api.tickets.deleteMany.useMutation({
    onMutate: async ({ ids }) => {
      await utils.tickets.getAll.cancel({ status: statusFilter });
      await utils.tickets.getStats.cancel();
      const prevTickets = utils.tickets.getAll.getData({ status: statusFilter });
      const prevStats = utils.tickets.getStats.getData();

      const ticketsToRemove = prevTickets?.filter((t) => ids.includes(t.id)) ?? [];
      let openDelta = 0;
      let inProgressDelta = 0;
      let resolvedDelta = 0;
      let unassignedDelta = 0;
      for (const t of ticketsToRemove) {
        if (t.status === 'open') openDelta -= 1;
        else if (t.status === 'in-progress') inProgressDelta -= 1;
        else if (t.status === 'resolved') resolvedDelta -= 1;
        if (t.status === 'open' && (!t.assigned_to || String(t.assigned_to).trim() === '')) unassignedDelta -= 1;
      }

      utils.tickets.getAll.setData({ status: statusFilter }, (old) =>
        old ? old.filter((t) => !ids.includes(t.id)) : old
      );
      if (prevStats) {
        utils.tickets.getStats.setData(undefined, {
          ...prevStats,
          total: Math.max(0, prevStats.total - ids.length),
          open: Math.max(0, prevStats.open + openDelta),
          inProgress: Math.max(0, prevStats.inProgress + inProgressDelta),
          resolved: Math.max(0, prevStats.resolved + resolvedDelta),
          unassigned: Math.max(0, prevStats.unassigned + unassignedDelta),
        });
      }
      setSelectedIds((prev) => {
        const next = new Set(prev);
        ids.forEach((id) => next.delete(id));
        return next;
      });
      return { prevTickets, prevStats };
    },
    onError: (err, _vars, ctx) => {
      if (ctx?.prevTickets) {
        utils.tickets.getAll.setData({ status: statusFilter }, ctx.prevTickets);
      }
      if (ctx?.prevStats) {
        utils.tickets.getStats.setData(undefined, ctx.prevStats);
      }
      toast.error(err.message ?? 'Failed to delete tickets');
    },
    onSuccess: (data) => {
      toast.success(`${data.deleted} ticket(s) deleted`);
      if (data.errors?.length) {
        toast.error(data.errors.join('; '));
      }
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
    return (
      <div className="p-4 md:p-6">
        <SkeletonTable rows={6} cols={9} />
      </div>
    );
  }

  if (tickets.length === 0) {
    return (
      <div className="p-8 text-center">
        <p className="text-[var(--color-text-muted)]">No tickets found</p>
        <p className="text-xs text-[var(--color-text-faint)] mt-1">Tickets will appear here when created via VAPI or the webhook API</p>
      </div>
    );
  }

  const handleBulkDelete = () => {
    if (selectedIds.size === 0) return;
    if (!window.confirm(`Delete ${selectedIds.size} ticket(s)? This cannot be undone and will remove their attachments from storage.`)) return;
    deleteManyMutation.mutate({ ids: Array.from(selectedIds) });
  };

  return (
    <div className="space-y-3">
      {someSelected && (
        <div className="flex items-center gap-3 px-4 py-2 bg-[var(--color-accent-light)]/50 rounded-lg border border-[var(--color-border-subtle)]">
          <span className="text-sm font-medium text-[var(--color-brand-navy)]">
            {selectedIds.size} selected
          </span>
          <button
            type="button"
            onClick={() => setSelectedIds(new Set())}
            className="text-sm text-[var(--color-text-secondary)] hover:underline"
          >
            Clear selection
          </button>
          <button
            type="button"
            onClick={handleBulkDelete}
            disabled={deleteManyMutation.isPending}
            className="px-3 py-1.5 rounded-lg text-sm font-medium bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
          >
            {deleteManyMutation.isPending ? 'Deleting…' : `Delete selected (${selectedIds.size})`}
          </button>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[var(--color-border-subtle)]">
              <th className="text-left py-3 px-4 w-10" onClick={(e) => e.stopPropagation()}>
                <input
                  type="checkbox"
                  checked={allSelected}
                  ref={(el) => {
                    if (el) el.indeterminate = someSelected && !allSelected;
                  }}
                  onChange={(e) => selectAll(e.target.checked)}
                  className="h-4 w-4 rounded border-[var(--color-border-default)] text-[var(--color-brand-orange)] focus:ring-[var(--color-brand-orange)]"
                  aria-label="Select all tickets"
                />
              </th>
              <th className="text-left py-3 px-4 text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wider">Created</th>
            <th className="text-left py-3 px-4 text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wider">Source</th>
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
                isSelected={selectedIds.has(ticket.id)}
                onToggleSelect={toggleSelect}
                onTicketClick={onTicketClick}
                onStatusSelect={handleStatusSelect}
                onAssignChange={handleAssignChange}
                onDelete={handleDelete}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
});
