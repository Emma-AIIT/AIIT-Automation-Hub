'use client';

import { type FC, useState } from 'react';
import { api } from '@/trpc/react';
import { getWorkerColor } from '@/lib/worker-colors';
import { format } from 'date-fns';
import type { TicketStatus } from '@/types/tickets';

interface Worker {
  id: string;
  name: string;
}

interface TicketDetailProps {
  ticketId: string;
  onClose: () => void;
  workers?: Worker[] | null;
}

export const TicketDetail: FC<TicketDetailProps> = ({ ticketId, onClose, workers: workersProp }) => {
  const { data: ticket, isLoading } = api.tickets.getById.useQuery({ id: ticketId });
  const [newNote, setNewNote] = useState('');

  const utils = api.useUtils();

  const updateStatusMutation = api.tickets.updateStatus.useMutation({
    onSuccess: () => {
      void utils.tickets.getById.invalidate({ id: ticketId });
      void utils.tickets.getAll.invalidate();
      void utils.tickets.getStats.invalidate();
    },
  });

  const { data: workersFetched } = api.workers.getAll.useQuery(undefined, { enabled: workersProp == null });
  const workers = workersProp ?? workersFetched;

  const assignWorkerMutation = api.tickets.assignWorker.useMutation({
    onSuccess: () => {
      void utils.tickets.getById.invalidate({ id: ticketId });
      void utils.tickets.getAll.invalidate();
    },
  });

  const addNoteMutation = api.tickets.addNote.useMutation({
    onSuccess: () => {
      setNewNote('');
      void utils.tickets.getById.invalidate({ id: ticketId });
    },
  });

  const deleteMutation = api.tickets.delete.useMutation({
    onSuccess: () => {
      void utils.tickets.getAll.invalidate();
      void utils.tickets.getStats.invalidate();
      onClose();
    },
  });

  const handleStatusChange = (status: TicketStatus) => {
    if (ticket?.status === status) return;
    updateStatusMutation.mutate({ id: ticketId, status });
  };

  const handleAddNote = () => {
    if (!newNote.trim()) return;
    addNoteMutation.mutate({ id: ticketId, note: newNote });
  };

  const handleDelete = () => {
    if (window.confirm('Delete this ticket? This cannot be undone.')) {
      deleteMutation.mutate({ id: ticketId });
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      <div className="absolute right-0 top-0 bottom-0 w-full max-w-2xl bg-white shadow-2xl overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-[var(--color-border-subtle)] p-6 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-[var(--color-brand-navy)]">Ticket Details</h2>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-gray-100 text-[var(--color-text-muted)]"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {isLoading ? (
          <div className="p-6 text-center text-[var(--color-text-muted)]">Loading...</div>
        ) : !ticket ? (
          <div className="p-6 text-center text-[var(--color-text-muted)]">Ticket not found</div>
        ) : (
          <div className="p-6 space-y-6">
            {/* Ticket Info */}
            <div className="bg-gray-50 rounded-xl p-6 space-y-4">
              <div>
                <p className="text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wider">Caller</p>
                <p className="text-lg font-semibold text-[var(--color-brand-navy)] mt-1">{ticket.caller_name}</p>
                {ticket.caller_phone && (
                  <p className="text-sm text-[var(--color-text-muted)] font-mono">{ticket.caller_phone}</p>
                )}
                {ticket.caller_email && (
                  <p className="text-sm text-[var(--color-text-muted)]">{ticket.caller_email}</p>
                )}
                {ticket.caller_business && (
                  <p className="text-sm text-[var(--color-text-muted)]">{ticket.caller_business}</p>
                )}
              </div>

              <div>
                <p className="text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wider">Created</p>
                <p className="text-sm text-[var(--color-brand-navy)] mt-1">
                  {format(new Date(ticket.created_at), 'dd MMM yyyy, h:mm a')}
                </p>
              </div>

              <div>
                <p className="text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wider">Status</p>
                <div className="flex gap-2 mt-2">
                  {(['open', 'in-progress', 'resolved'] as TicketStatus[]).map((status) => (
                    <button
                      key={status}
                      onClick={() => handleStatusChange(status)}
                      disabled={updateStatusMutation.isPending}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                        ticket.status === status
                          ? 'bg-[var(--color-brand-orange)] text-white'
                          : 'bg-gray-200 text-[var(--color-text-secondary)] hover:bg-gray-300'
                      }`}
                    >
                      {status.replace('-', ' ')}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wider">Assigned To</p>
                {(() => {
                  const assignedTo = ticket.assigned_to ?? '';
                  const color = assignedTo ? getWorkerColor(assignedTo) : null;
                  return (
                    <select
                      value={assignedTo}
                      onChange={(e) => assignWorkerMutation.mutate({
                        id: ticketId,
                        assigned_to: e.target.value || null,
                      })}
                      disabled={assignWorkerMutation.isPending}
                      className={`mt-2 w-full px-3 py-1.5 rounded-lg text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[var(--color-brand-orange)] ${
                        color ? `border ${color.bg} ${color.text} ${color.border}` : 'border border-[var(--color-border-default)] bg-white'
                      }`}
                    >
                      <option value="">Unassigned</option>
                      {workers?.map((w) => (
                        <option key={w.id} value={w.name}>{w.name}</option>
                      ))}
                    </select>
                  );
                })()}
              </div>
            </div>

            {/* Inquiry */}
            <div>
              <h3 className="text-sm font-semibold text-[var(--color-brand-navy)] mb-3">Inquiry</h3>
              <div className="bg-gray-50 rounded-xl p-4 text-sm text-[var(--color-text-secondary)]">
                {ticket.inquiry}
              </div>
            </div>

            {/* Summary */}
            {ticket.summary && (
              <div>
                <h3 className="text-sm font-semibold text-[var(--color-brand-navy)] mb-3">Summary</h3>
                <div className="bg-blue-50 rounded-xl p-4 text-sm text-[var(--color-text-secondary)]">
                  {ticket.summary}
                </div>
              </div>
            )}

            {/* Recording */}
            {ticket.recording_url && (
              <div>
                <h3 className="text-sm font-semibold text-[var(--color-brand-navy)] mb-3">Call Recording</h3>
                <audio controls className="w-full">
                  <source src={ticket.recording_url} type="audio/mpeg" />
                </audio>
              </div>
            )}

            {/* Notes */}
            <div>
              <h3 className="text-sm font-semibold text-[var(--color-brand-navy)] mb-3">Internal Notes</h3>
              {ticket.notes ? (
                <div className="bg-gray-50 rounded-xl p-4 text-sm text-[var(--color-text-secondary)] whitespace-pre-wrap mb-4">
                  {ticket.notes}
                </div>
              ) : (
                <p className="text-sm text-[var(--color-text-faint)] mb-4">No notes yet</p>
              )}

              <div className="flex gap-2">
                <textarea
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  placeholder="Add a note..."
                  rows={3}
                  className="flex-1 px-4 py-2 rounded-lg border border-[var(--color-border-default)] text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[var(--color-brand-orange)]"
                />
                <button
                  onClick={handleAddNote}
                  disabled={addNoteMutation.isPending || !newNote.trim()}
                  className="px-4 py-2 rounded-lg bg-[var(--color-brand-orange)] text-white text-sm font-medium hover:bg-[var(--color-accent-hover)] disabled:opacity-50 disabled:cursor-not-allowed self-end"
                >
                  Add
                </button>
              </div>
            </div>

            {/* Delete */}
            <div className="pt-4 border-t border-[var(--color-border-subtle)]">
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleteMutation.isPending}
                className="px-4 py-2 rounded-lg border border-red-200 bg-red-50 text-red-600 text-sm font-medium hover:bg-red-100 disabled:opacity-50"
              >
                Delete ticket
              </button>
            </div>

            {/* VAPI Call Link */}
            {ticket.vapi_call_id && (
              <div>
                <h3 className="text-sm font-semibold text-[var(--color-brand-navy)] mb-3">Linked VAPI Call</h3>
                <a
                  href={`/automations/voice-agents?call=${ticket.vapi_call_id}`}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-100 text-sm font-medium text-[var(--color-text-secondary)] hover:bg-gray-200"
                >
                  View Call Details
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                    <polyline points="15 3 21 3 21 9" />
                    <line x1="10" y1="14" x2="21" y2="3" />
                  </svg>
                </a>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
