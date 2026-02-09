'use client';

import { type FC, useState } from 'react';
import { api } from '@/trpc/react';
import { getWorkerColor } from '@/lib/worker-colors';
import { format } from 'date-fns';
import type { TicketStatus, TicketPriority, TicketSource, TicketAttachment } from '@/types/tickets';

interface Worker {
  id: string;
  name: string;
}

interface TicketDetailProps {
  ticketId: string;
  onClose: () => void;
  workers?: Worker[] | null;
}

/** Escape special regex characters in a string */
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Prepare email HTML for display:
 * - If cidToUrl is provided, replace each src="cid:contentId" with the signed URL so inline images show in place.
 * - Otherwise replace cid: refs with a placeholder so we don't show broken images.
 */
function sanitizeEmailHtmlForDisplay(html: string, cidToUrl?: Record<string, string>): string {
  if (!html?.trim()) return html;
  if (cidToUrl && Object.keys(cidToUrl).length > 0) {
    let out = html;
    for (const [contentId, url] of Object.entries(cidToUrl)) {
      if (!url) continue;
      const escaped = escapeRegex(contentId);
      out = out.replace(
        new RegExp(`(src\\s*=\\s*["']?)cid:${escaped}(["']?)`, 'gi'),
        `$1${url}$2`
      );
    }
    return out;
  }
  return html.replace(
    /<img([^>]*)\ssrc\s*=\s*["']?\s*cid:[^"'\s>]+["']?([^>]*)>/gi,
    '<span class="inline-image-placeholder" style="display:inline-block;min-width:80px;min-height:40px;background:#f0f0f0;color:#888;font-size:11px;vertical-align:middle;text-align:center;line-height:40px;border:1px solid #ddd;border-radius:4px;">[Inline image]</span>'
  );
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const AttachmentRow: FC<{
  attachment: TicketAttachment;
  pdfPreviewId: string | null;
  onPdfPreviewToggle: (id: string | null) => void;
}> = ({ attachment, pdfPreviewId, onPdfPreviewToggle }) => {
  const { data, isLoading } = api.tickets.getAttachmentUrl.useQuery(
    { storage_path: attachment.storage_path },
    { staleTime: 50 * 60 * 1000 } // 50 min (under 1hr expiry)
  );
  const isImage = attachment.file_type.startsWith('image/');
  const isPdf = attachment.file_type === 'application/pdf';
  const showPdfPreview = pdfPreviewId === attachment.id;

  return (
    <li className="flex flex-col gap-2 rounded-lg border border-[var(--color-border-subtle)] p-3 bg-gray-50">
      <div className="flex items-center gap-3">
        {isImage && data?.url && (
          <img src={data.url} alt={attachment.file_name} className="h-12 w-12 object-cover rounded border border-gray-200" />
        )}
        {!isImage && (
          <span className="flex h-12 w-12 items-center justify-center rounded border border-gray-200 bg-white text-[var(--color-text-muted)]">
            {isPdf ? (
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
            ) : (
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/></svg>
            )}
          </span>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-[var(--color-text-primary)] truncate">{attachment.file_name}</p>
          <p className="text-xs text-[var(--color-text-muted)]">{formatFileSize(attachment.file_size)}</p>
        </div>
        {data?.url && (
          <div className="flex items-center gap-2 shrink-0">
            {isPdf && (
              <button
                type="button"
                onClick={() => onPdfPreviewToggle(showPdfPreview ? null : attachment.id)}
                className="px-2 py-1 rounded text-xs font-medium border border-[var(--color-border-default)] bg-white hover:bg-gray-50"
              >
                {showPdfPreview ? 'Hide' : 'Preview'}
              </button>
            )}
            <a href={data.url} download={attachment.file_name} target="_blank" rel="noopener noreferrer" className="px-2 py-1 rounded text-xs font-medium bg-[var(--color-brand-orange)] text-white hover:opacity-90">
              Download
            </a>
          </div>
        )}
        {isLoading && <span className="text-xs text-[var(--color-text-muted)]">Loading…</span>}
      </div>
      {isPdf && showPdfPreview && data?.url && (
        <iframe title={attachment.file_name} src={data.url} className="w-full h-[400px] rounded border border-gray-200" />
      )}
    </li>
  );
};

const SOURCE_LABELS: Record<TicketSource, string> = {
  phone: 'Phone',
  email: 'Email',
  manual: 'Manual',
  'walk-in': 'Walk-in',
};

const SOURCE_BADGE_CLASS: Record<TicketSource, string> = {
  phone: 'bg-blue-100 text-blue-700 border-blue-200',
  email: 'bg-violet-100 text-violet-700 border-violet-200',
  manual: 'bg-gray-100 text-gray-700 border-gray-200',
  'walk-in': 'bg-amber-100 text-amber-700 border-amber-200',
};

export const TicketDetail: FC<TicketDetailProps> = ({ ticketId, onClose, workers: workersProp }) => {
  const { data: ticket, isLoading } = api.tickets.getById.useQuery({ id: ticketId });
  const [newNote, setNewNote] = useState('');
  const [pdfPreviewId, setPdfPreviewId] = useState<string | null>(null);

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

  const updatePriorityMutation = api.tickets.updatePriority.useMutation({
    onMutate: async (newData) => {
      await utils.tickets.getById.cancel({ id: ticketId });
      const previous = utils.tickets.getById.getData({ id: ticketId });
      utils.tickets.getById.setData({ id: ticketId }, (old) =>
        old ? { ...old, priority: newData.priority, priority_reason: newData.priority_reason ?? null } : old
      );
      return { previous };
    },
    onError: (_err, _newData, context) => {
      if (context?.previous) {
        utils.tickets.getById.setData({ id: ticketId }, context.previous);
      }
    },
    onSettled: () => {
      void utils.tickets.getById.invalidate({ id: ticketId });
      void utils.tickets.getAll.invalidate();
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

  const handlePriorityChange = (priority: TicketPriority) => {
    if (ticket?.priority === priority) return;
    updatePriorityMutation.mutate({ id: ticketId, priority, priority_reason: null });
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

  // Inline email images: attachments with content_id map to cid: in HTML
  const inlineAttachments =
    ticket && 'attachments' in ticket && Array.isArray(ticket.attachments)
      ? ticket.attachments.filter((a) => a.content_id)
      : [];
  const inlineStoragePaths = inlineAttachments.map((a) => a.storage_path);
  const { data: inlineUrlsData } = api.tickets.getAttachmentUrls.useQuery(
    { storage_paths: inlineStoragePaths },
    { enabled: inlineStoragePaths.length > 0 && !!ticket }
  );
  const cidToUrl: Record<string, string> = {};
  if (inlineUrlsData?.urls && inlineAttachments.length > 0) {
    for (const att of inlineAttachments) {
      const pair = inlineUrlsData.urls.find((u) => u.storage_path === att.storage_path);
      if (pair?.url && att.content_id) cidToUrl[att.content_id] = pair.url;
    }
  }

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
                <p className="text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wider">Customer</p>
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

              <div className="flex flex-wrap items-center gap-3">
                <div>
                  <p className="text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wider">Created</p>
                  <p className="text-sm text-[var(--color-brand-navy)] mt-1">
                    {format(new Date(ticket.created_at), 'dd MMM yyyy, h:mm a')}
                  </p>
                </div>
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-medium border ${SOURCE_BADGE_CLASS[ticket.source ?? 'manual']}`}>
                  {SOURCE_LABELS[ticket.source ?? 'manual']}
                </span>
              </div>

              {ticket.source === 'email' && (ticket.email_subject ?? ticket.email_cc ?? ticket.email_bcc) && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wider">Email</p>
                  {ticket.email_subject && (
                    <p className="text-sm text-[var(--color-brand-navy)]"><span className="text-[var(--color-text-muted)]">Subject:</span> {ticket.email_subject}</p>
                  )}
                  {ticket.email_cc && (
                    <p className="text-sm text-[var(--color-text-secondary)]"><span className="text-[var(--color-text-muted)]">CC:</span> {ticket.email_cc}</p>
                  )}
                  {ticket.email_bcc && (
                    <p className="text-sm text-[var(--color-text-secondary)]"><span className="text-[var(--color-text-muted)]">BCC:</span> {ticket.email_bcc}</p>
                  )}
                </div>
              )}

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
                <p className="text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wider">Priority</p>
                <div className="flex gap-2 mt-2">
                  <button
                    onClick={() => handlePriorityChange('high')}
                    disabled={updatePriorityMutation.isPending}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      ticket.priority === 'high'
                        ? 'bg-red-500 text-white'
                        : 'bg-red-50 text-red-700 border border-red-200 hover:bg-red-100'
                    }`}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M14.4 6L14 4H5v17h2v-7h5.6l.4 2h7V6z"/></svg>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M14.4 6L14 4H5v17h2v-7h5.6l.4 2h7V6z"/></svg>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M14.4 6L14 4H5v17h2v-7h5.6l.4 2h7V6z"/></svg>
                    High
                  </button>
                  <button
                    onClick={() => handlePriorityChange('low')}
                    disabled={updatePriorityMutation.isPending}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      ticket.priority === 'low'
                        ? 'bg-blue-500 text-white'
                        : 'bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100'
                    }`}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M14.4 6L14 4H5v17h2v-7h5.6l.4 2h7V6z"/></svg>
                    Low
                  </button>
                  <button
                    onClick={() => handlePriorityChange(null)}
                    disabled={updatePriorityMutation.isPending}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      ticket.priority === null
                        ? 'bg-gray-500 text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    None
                  </button>
                </div>
                {ticket.priority_reason && (
                  <p className="mt-2 text-sm text-[var(--color-text-secondary)] bg-gray-50 rounded-lg p-3">
                    {ticket.priority_reason}
                  </p>
                )}
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
              {ticket.source === 'email' && /^\s*</.test(ticket.inquiry) ? (
                <div className="bg-gray-50 rounded-xl overflow-hidden border border-[var(--color-border-subtle)]">
                  <iframe
                    title="Email body"
                    sandbox="allow-same-origin"
                    srcDoc={sanitizeEmailHtmlForDisplay(ticket.inquiry, Object.keys(cidToUrl).length > 0 ? cidToUrl : undefined)}
                    className="w-full min-h-[200px] max-h-[400px] border-0"
                    style={{ height: 'min(400px, 60vh)' }}
                  />
                </div>
              ) : (
                <div className="bg-gray-50 rounded-xl p-4 text-sm text-[var(--color-text-secondary)] whitespace-pre-wrap">
                  {ticket.inquiry}
                </div>
              )}
            </div>

            {/* Attachments */}
            {'attachments' in ticket && Array.isArray(ticket.attachments) && ticket.attachments.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-[var(--color-brand-navy)] mb-3">Attachments</h3>
                <ul className="space-y-3">
                  {ticket.attachments.map((att) => (
                    <AttachmentRow key={att.id} attachment={att} pdfPreviewId={pdfPreviewId} onPdfPreviewToggle={setPdfPreviewId} />
                  ))}
                </ul>
              </div>
            )}

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
