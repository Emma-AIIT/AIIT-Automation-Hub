'use client';

import { type FC, useState } from 'react';
import Image from 'next/image';
import { api } from '@/trpc/react';
import { getWorkerColor } from '@/lib/worker-colors';
import { format } from 'date-fns';
import type { TicketStatus, TicketPriority, TicketSource, TicketAttachment, TicketReply } from '@/types/tickets';

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

/**
 * Format CC/BCC from raw value. Handles:
 * - Plain string: "email@x.com" or "Name <email@x.com>"
 * - Microsoft Graph JSON: {"emailAddress":{"name":"...","address":"..."}} or array of same
 */
function formatEmailRecipients(raw: string | null | undefined): string {
  if (raw == null || String(raw).trim() === '') return '';
  const s = String(raw).trim();
  if (!s.startsWith('{') && !s.startsWith('[')) return s;
  try {
    const parsed = JSON.parse(s) as unknown;
    const one = (obj: unknown): string => {
      if (obj && typeof obj === 'object' && 'emailAddress' in obj) {
        const ea = (obj as { emailAddress?: { name?: string; address?: string } }).emailAddress;
        if (ea && typeof ea === 'object') {
          const name = ea.name?.trim();
          const address = ea.address?.trim();
          if (address) return name ? `${name} <${address}>` : address;
        }
      }
      if (obj && typeof obj === 'object' && 'address' in obj) {
        const o = obj as { name?: string; address?: string };
        const address = o.address?.trim();
        if (address) return o.name?.trim() ? `${o.name.trim()} <${address}>` : address;
      }
      return '';
    };
    if (Array.isArray(parsed)) {
      return parsed.map(one).filter(Boolean).join(', ');
    }
    return one(parsed) || s;
  } catch {
    return s;
  }
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
    <li className="flex flex-col gap-3 rounded-xl border border-[var(--color-border-subtle)] p-4 bg-[var(--color-bg-secondary)] shadow-sm">
      <div className="flex items-center gap-4">
        {isImage && data?.url && (
          <Image src={data.url} alt={attachment.file_name} width={48} height={48} className="h-12 w-12 object-cover rounded-lg border border-[var(--color-border-subtle)] shrink-0" unoptimized />
        )}
        {!isImage && (
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-[var(--color-border-subtle)] bg-white text-[var(--color-text-muted)]">
            {isPdf ? (
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
            ) : (
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/></svg>
            )}
          </span>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-[var(--color-text-primary)] truncate">{attachment.file_name}</p>
          <p className="text-xs text-[var(--color-text-muted)] mt-0.5">{formatFileSize(attachment.file_size)}</p>
        </div>
        {data?.url && (
          <div className="flex items-center gap-2 shrink-0">
            {isPdf && (
              <button
                type="button"
                onClick={() => onPdfPreviewToggle(showPdfPreview ? null : attachment.id)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium border border-[var(--color-border-default)] bg-white hover:bg-[var(--color-bg-hover)] transition-colors"
              >
                {showPdfPreview ? 'Hide' : 'Preview'}
              </button>
            )}
            <a href={data.url} download={attachment.file_name} target="_blank" rel="noopener noreferrer" className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-[var(--color-brand-orange)] text-white hover:opacity-90 transition-opacity">
              Download
            </a>
          </div>
        )}
        {isLoading && <span className="text-xs text-[var(--color-text-muted)]">Loading…</span>}
      </div>
      {isPdf && showPdfPreview && data?.url && (
        <iframe title={attachment.file_name} src={data.url} className="w-full h-[400px] rounded-lg border border-[var(--color-border-subtle)]" />
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
  const { data: replies = [] } = api.tickets.getReplies.useQuery(
    { ticketId },
    { enabled: !!ticket && ticket.source === 'email' }
  );
  const [newNote, setNewNote] = useState('');
  const [replyBody, setReplyBody] = useState('');
  const [replyCc, setReplyCc] = useState('');
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

  const sendReplyMutation = api.tickets.sendReply.useMutation({
    onSuccess: () => {
      setReplyBody('');
      setReplyCc('');
      void utils.tickets.getById.invalidate({ id: ticketId });
      void utils.tickets.getReplies.invalidate({ ticketId });
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
    <div className="fixed inset-0 z-50 overflow-y-auto" aria-modal="true" role="dialog">
      <div
        className="fixed inset-0 bg-[var(--color-backdrop)] transition-opacity duration-200"
        onClick={onClose}
        aria-hidden
      />

      <div className="fixed inset-0 flex items-stretch justify-center p-4 pointer-events-none min-h-0 max-h-screen">
        <div
          className="w-full max-w-6xl flex flex-col bg-white rounded-2xl shadow-2xl border border-[var(--color-border-subtle)] pointer-events-auto overflow-hidden max-h-[92vh]"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <header className="shrink-0 flex items-center justify-between px-6 py-4 border-b border-[var(--color-border-subtle)] bg-white">
            <h2 className="text-xl font-semibold tracking-tight text-[var(--color-brand-navy)]">Ticket Details</h2>
            <button
              onClick={onClose}
              className="p-2.5 rounded-xl hover:bg-[var(--color-bg-hover)] text-[var(--color-text-muted)] transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--color-brand-orange)] focus:ring-offset-2"
              aria-label="Close"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </header>

          {isLoading ? (
            <div className="flex-1 flex items-center justify-center py-16 text-[var(--color-text-muted)] text-sm">Loading…</div>
          ) : !ticket ? (
            <div className="flex-1 flex items-center justify-center py-16 text-[var(--color-text-muted)] text-sm">Ticket not found</div>
          ) : (
            <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[340px_1fr] overflow-hidden">
              {/* Left column: full-height metadata & controls */}
              <aside
                className="flex flex-col h-full min-h-0 bg-[var(--color-bg-secondary)] border-r border-[var(--color-border-subtle)]"
                style={{ minHeight: 'min(100%, 60vh)' }}
              >
                <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
                  <div className="p-5 space-y-5">
                    {/* Customer */}
                    <div className="space-y-3">
                      <p className="text-[11px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">Customer</p>
                      <div className="rounded-xl bg-white border border-[var(--color-border-subtle)] p-4 shadow-sm">
                        <p className="font-semibold text-[var(--color-brand-navy)] text-[15px] leading-tight">{ticket.caller_name}</p>
                        <div className="mt-2 space-y-1">
                          {ticket.caller_email && (
                            <p className="text-sm text-[var(--color-text-secondary)] truncate" title={ticket.caller_email}>{ticket.caller_email}</p>
                          )}
                          {ticket.caller_phone && (
                            <p className="text-sm text-[var(--color-text-muted)] font-mono">{ticket.caller_phone}</p>
                          )}
                          {ticket.caller_business && (
                            <p className="text-sm text-[var(--color-text-muted)]">{ticket.caller_business}</p>
                          )}
                        </div>
                        <div className="mt-3 pt-3 border-t border-[var(--color-border-subtle)] flex items-center gap-2 flex-wrap">
                          <span className="text-xs text-[var(--color-text-muted)]">{format(new Date(ticket.created_at), 'dd MMM yyyy, h:mm a')}</span>
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-wide border ${SOURCE_BADGE_CLASS[ticket.source ?? 'manual']}`}>
                            {SOURCE_LABELS[ticket.source ?? 'manual']}
                          </span>
                        </div>
                        {ticket.source === 'email' && (ticket.email_subject ?? ticket.email_cc ?? ticket.email_bcc) && (
                          <div className="mt-3 pt-3 border-t border-[var(--color-border-subtle)] space-y-1">
                            {ticket.email_subject && (
                              <p className="text-xs text-[var(--color-brand-navy)] truncate" title={ticket.email_subject}>
                                <span className="text-[var(--color-text-muted)]">Subject:</span> {ticket.email_subject}
                              </p>
                            )}
                            {ticket.email_cc && (
                              <p className="text-xs text-[var(--color-text-secondary)] break-words min-w-0" title={formatEmailRecipients(ticket.email_cc)}><span className="text-[var(--color-text-muted)]">CC:</span> {formatEmailRecipients(ticket.email_cc)}</p>
                            )}
                            {ticket.email_bcc && (
                              <p className="text-xs text-[var(--color-text-secondary)] break-words min-w-0" title={formatEmailRecipients(ticket.email_bcc)}><span className="text-[var(--color-text-muted)]">BCC:</span> {formatEmailRecipients(ticket.email_bcc)}</p>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Status */}
                    <div className="space-y-2">
                      <p className="text-[11px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">Status</p>
                      <div className="flex gap-2 flex-wrap">
                        {(['open', 'in-progress', 'resolved'] as TicketStatus[]).map((status) => (
                          <button
                            key={status}
                            onClick={() => handleStatusChange(status)}
                            disabled={updateStatusMutation.isPending}
                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                              ticket.status === status
                                ? 'bg-[var(--color-brand-orange)] text-white shadow-sm'
                                : 'bg-white border border-[var(--color-border-default)] text-[var(--color-text-secondary)] hover:border-[var(--color-border-strong)] hover:bg-[var(--color-bg-hover)]'
                            }`}
                          >
                            {status.replace('-', ' ')}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Priority */}
                    <div className="space-y-2">
                      <p className="text-[11px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">Priority</p>
                      <div className="flex gap-2 flex-wrap">
                        <button
                          onClick={() => handlePriorityChange('high')}
                          disabled={updatePriorityMutation.isPending}
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                            ticket.priority === 'high' ? 'bg-red-500 text-white shadow-sm' : 'bg-white border border-red-200 text-red-600 hover:bg-red-50'
                          }`}
                        >
                          High
                        </button>
                        <button
                          onClick={() => handlePriorityChange('low')}
                          disabled={updatePriorityMutation.isPending}
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                            ticket.priority === 'low' ? 'bg-blue-500 text-white shadow-sm' : 'bg-white border border-blue-200 text-blue-600 hover:bg-blue-50'
                          }`}
                        >
                          Low
                        </button>
                        <button
                          onClick={() => handlePriorityChange(null)}
                          disabled={updatePriorityMutation.isPending}
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                            ticket.priority === null ? 'bg-[var(--color-text-muted)] text-white shadow-sm' : 'bg-white border border-[var(--color-border-default)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)]'
                          }`}
                        >
                          None
                        </button>
                      </div>
                      {ticket.priority_reason && (
                        <p className="text-xs text-[var(--color-text-secondary)] bg-white rounded-lg px-3 py-2 border border-[var(--color-border-subtle)] mt-2">
                          {ticket.priority_reason}
                        </p>
                      )}
                    </div>

                    {/* Assigned To */}
                    <div className="space-y-2">
                      <p className="text-[11px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">Assigned To</p>
                      {(() => {
                        const assignedTo = ticket.assigned_to ?? '';
                        const color = assignedTo ? getWorkerColor(assignedTo) : null;
                        return (
                          <select
                            value={assignedTo}
                            onChange={(e) => assignWorkerMutation.mutate({ id: ticketId, assigned_to: e.target.value || null })}
                            disabled={assignWorkerMutation.isPending}
                            className={`w-full px-3 py-2 rounded-xl text-sm font-medium border bg-white focus:outline-none focus:ring-2 focus:ring-[var(--color-brand-orange)] focus:ring-offset-0 ${
                              color ? `border ${color.bg} ${color.text} ${color.border}` : 'border-[var(--color-border-default)] text-[var(--color-text-primary)]'
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

                    {/* Recording */}
                    {ticket.recording_url && (
                      <div className="space-y-2">
                        <p className="text-[11px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">Recording</p>
                        <div className="rounded-xl bg-white border border-[var(--color-border-subtle)] p-3">
                          <audio controls className="w-full h-9 accent-[var(--color-brand-orange)]">
                            <source src={ticket.recording_url} type="audio/mpeg" />
                          </audio>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Footer: fixed at bottom of left column */}
                <div className="shrink-0 p-4 pt-2 border-t border-[var(--color-border-subtle)] bg-[var(--color-bg-secondary)] space-y-2">
                  {ticket.vapi_call_id && (
                    <a
                      href={`/automations/voice-agents?call=${ticket.vapi_call_id}`}
                      className="flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-xl bg-white border border-[var(--color-border-default)] text-sm font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)] hover:border-[var(--color-border-strong)] transition-colors"
                    >
                      View VAPI Call
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                        <polyline points="15 3 21 3 21 9" />
                        <line x1="10" y1="14" x2="21" y2="3" />
                      </svg>
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={handleDelete}
                    disabled={deleteMutation.isPending}
                    className="w-full px-4 py-2.5 rounded-xl border border-red-200 bg-red-50 text-red-600 text-sm font-semibold hover:bg-red-100 hover:border-red-300 disabled:opacity-50 transition-colors focus:outline-none focus:ring-2 focus:ring-red-300 focus:ring-offset-2"
                  >
                    Delete ticket
                  </button>
                </div>
              </aside>

              {/* Right column: content — scrolls independently */}
              <div className="flex flex-col min-h-0 overflow-y-auto bg-white">
                <div className="p-6 space-y-6">
                  {/* Inquiry */}
                  <section className="space-y-3">
                    <h3 className="text-[11px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">Inquiry</h3>
                    {ticket.source === 'email' && /^\s*</.test(ticket.inquiry) ? (
                      <div className="rounded-xl border border-[var(--color-border-subtle)] overflow-hidden bg-[var(--color-bg-secondary)] shadow-inner min-h-[200px]" style={{ maxHeight: 'min(420px, 45vh)' }}>
                        <iframe
                          title="Email body"
                          sandbox="allow-same-origin"
                          srcDoc={sanitizeEmailHtmlForDisplay(ticket.inquiry, Object.keys(cidToUrl).length > 0 ? cidToUrl : undefined)}
                          className="w-full border-0 bg-white"
                          style={{ height: 'min(420px, 45vh)', minHeight: 200 }}
                        />
                      </div>
                    ) : (
                      <div className="rounded-xl border border-[var(--color-border-subtle)] p-4 bg-[var(--color-bg-secondary)] text-sm text-[var(--color-text-secondary)] whitespace-pre-wrap max-h-[360px] overflow-y-auto">
                        {ticket.inquiry}
                      </div>
                    )}
                  </section>

                  {/* Email thread + reply (email tickets only) */}
                  {ticket.source === 'email' && (
                    <section className="space-y-4">
                      <h3 className="text-[11px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">Email thread</h3>
                      {replies.length > 0 ? (
                        <ul className="space-y-4 max-h-[320px] overflow-y-auto pr-1">
                          {replies.map((reply: TicketReply) => (
                            <li
                              key={reply.id}
                              className={`rounded-xl border p-4 shadow-sm ${
                                reply.direction === 'outbound'
                                  ? 'border-[var(--color-brand-orange)]/30 bg-[var(--color-accent-light)]/30 ml-4'
                                  : 'border-rose-200 bg-rose-50/80 mr-4'
                              }`}
                            >
                              <div className="flex items-center gap-2 mb-2">
                                <span className={`text-[10px] font-semibold uppercase tracking-wide ${
                                  reply.direction === 'outbound' ? 'text-[var(--color-brand-orange)]' : 'text-rose-700'
                                }`}>
                                  {reply.direction === 'outbound' ? 'You' : 'Customer'}
                                </span>
                                {reply.sent_by && reply.direction === 'outbound' && (
                                  <span className="text-[10px] text-[var(--color-text-muted)]">· {reply.sent_by}</span>
                                )}
                                <span className="text-[10px] text-[var(--color-text-muted)]">
                                  {format(new Date(reply.created_at), 'dd MMM yyyy, h:mm a')}
                                </span>
                              </div>
                              {reply.body_plain ? (
                                <p className="text-sm text-[var(--color-text-secondary)] whitespace-pre-wrap">{reply.body_plain}</p>
                              ) : /^\s*</.test(reply.body) ? (
                                <div
                                  className="text-sm text-[var(--color-text-secondary)] prose prose-sm max-w-none"
                                  dangerouslySetInnerHTML={{ __html: reply.body }}
                                />
                              ) : (
                                <p className="text-sm text-[var(--color-text-secondary)] whitespace-pre-wrap">{reply.body}</p>
                              )}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <div className="rounded-xl border border-dashed border-[var(--color-border-subtle)] bg-[var(--color-bg-secondary)]/50 px-4 py-5 text-center">
                          <p className="text-sm text-[var(--color-text-muted)]">No replies yet. Send a reply below.</p>
                        </div>
                      )}
                      <div className="rounded-xl border border-[var(--color-border-subtle)] bg-white p-4 space-y-3">
                        <p className="text-[11px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">Reply to {ticket.caller_email ?? 'customer'}</p>
                        <textarea
                          value={replyBody}
                          onChange={(e) => setReplyBody(e.target.value)}
                          placeholder="Type your reply…"
                          rows={4}
                          className="w-full px-4 py-3 rounded-lg border border-[var(--color-border-default)] bg-white text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[var(--color-brand-orange)] focus:border-transparent placeholder:text-[var(--color-text-muted)]"
                        />
                        <input
                          type="text"
                          value={replyCc}
                          onChange={(e) => setReplyCc(e.target.value)}
                          placeholder="CC (optional)"
                          className="w-full px-4 py-2 rounded-lg border border-[var(--color-border-default)] bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-brand-orange)] focus:border-transparent placeholder:text-[var(--color-text-muted)]"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            sendReplyMutation.mutate({
                              ticketId,
                              body: replyBody.trim(),
                              bodyPlain: replyBody.trim(),
                              cc: replyCc.trim() || undefined,
                              sentBy: ticket.assigned_to ?? undefined,
                            })
                          }
                          disabled={sendReplyMutation.isPending || !replyBody.trim()}
                          className="px-4 py-2.5 rounded-lg bg-[var(--color-brand-orange)] text-white text-sm font-semibold hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity focus:outline-none focus:ring-2 focus:ring-[var(--color-brand-orange)] focus:ring-offset-2"
                        >
                          {sendReplyMutation.isPending ? 'Sending…' : 'Send reply'}
                        </button>
                        {sendReplyMutation.isError && (
                          <p className="text-xs text-red-600">{sendReplyMutation.error.message}</p>
                        )}
                      </div>
                    </section>
                  )}

                  {'attachments' in ticket && Array.isArray(ticket.attachments) && ticket.attachments.length > 0 && (
                    <section className="space-y-3">
                      <h3 className="text-[11px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">Attachments</h3>
                      <ul className="space-y-3">
                        {ticket.attachments.map((att) => (
                          <AttachmentRow key={att.id} attachment={att} pdfPreviewId={pdfPreviewId} onPdfPreviewToggle={setPdfPreviewId} />
                        ))}
                      </ul>
                    </section>
                  )}

                  {ticket.summary && (
                    <section className="space-y-3">
                      <h3 className="text-[11px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">Summary</h3>
                      <div className="rounded-xl border border-[var(--color-border-subtle)] p-4 bg-[var(--color-accent-light)]/50 text-sm text-[var(--color-text-secondary)] max-h-[160px] overflow-y-auto">
                        {ticket.summary}
                      </div>
                    </section>
                  )}

                  {/* Internal Notes */}
                  <section className="space-y-4">
                    <div className="flex items-center gap-2">
                      <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-100 text-amber-700" aria-hidden>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                        </svg>
                      </span>
                      <h3 className="text-[11px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">Internal Notes</h3>
                      <span className="rounded-md bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-800 border border-amber-200/80">Internal only</span>
                    </div>
                    {ticket.notes ? (
                      <ul className="space-y-3 max-h-[220px] overflow-y-auto pr-1">
                        {ticket.notes
                          .split(/\n\s*\n/)
                          .map((block) => block.trim())
                          .filter(Boolean)
                          .map((block, i) => {
                            const noteRegex = /^\[([^\]]+)\]\s*(.*)/s;
                            const match = noteRegex.exec(block);
                            const timestamp = match?.[1] ?? '';
                            const body = (match?.[2] ?? block).trim();
                            return (
                              <li
                                key={i}
                                className="rounded-xl border border-amber-100 bg-amber-50/80 p-3.5 shadow-sm border-l-4 border-l-amber-400"
                              >
                                <p className="text-[10px] font-semibold text-amber-700/90 uppercase tracking-wide mb-1.5">{timestamp}</p>
                                <p className="text-sm text-[var(--color-text-secondary)] whitespace-pre-wrap leading-relaxed">{body || '—'}</p>
                              </li>
                            );
                          })}
                      </ul>
                    ) : (
                      <div className="rounded-xl border border-amber-200/60 border-dashed bg-amber-50/40 px-4 py-6 text-center">
                        <p className="text-sm text-amber-800/80">No internal notes yet</p>
                        <p className="text-xs text-[var(--color-text-faint)] mt-1">Notes are only visible to your team</p>
                      </div>
                    )}
                    <div className="rounded-xl border border-amber-200/60 bg-amber-50/30 p-3 space-y-3">
                      <label htmlFor="ticket-internal-note" className="text-xs font-medium text-amber-800/90 flex items-center gap-2">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                        </svg>
                        Add internal note (not sent to customer)
                      </label>
                      <div className="flex gap-3">
                        <textarea
                          id="ticket-internal-note"
                          value={newNote}
                          onChange={(e) => setNewNote(e.target.value)}
                          placeholder="e.g. Called customer, waiting on invoice…"
                          rows={3}
                          className="flex-1 px-4 py-3 rounded-lg border border-amber-200/80 bg-white text-sm resize-none focus:outline-none focus:ring-2 focus:ring-amber-400/60 focus:border-amber-300 placeholder:text-[var(--color-text-faint)]"
                        />
                        <button
                          onClick={handleAddNote}
                          disabled={addNoteMutation.isPending || !newNote.trim()}
                          className="px-5 py-3 rounded-lg bg-amber-600 text-white text-sm font-semibold hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed shrink-0 self-end transition-colors focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2"
                        >
                          {addNoteMutation.isPending ? 'Adding…' : 'Add note'}
                        </button>
                      </div>
                    </div>
                  </section>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
