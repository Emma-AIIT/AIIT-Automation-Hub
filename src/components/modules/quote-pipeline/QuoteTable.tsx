'use client';

import { useState, useMemo } from 'react';
import type { Quote } from '@/lib/mock-data/quotes';
import { MOCK_QUOTES } from '@/lib/mock-data/quotes';
import { AvatarInitials } from '@/components/shared/AvatarInitials';
import { QuoteFilters } from './QuoteFilters';
import { QuoteDetailDrawer } from './QuoteDetailDrawer';

const PAGE_SIZE = 6;

/** Status: only these four with colors */
const STATUS_OPTIONS: Quote['status'][] = ['Pre sales', 'Quote', 'Lost', 'Won'];
const STATUS_PILL_CLASS: Record<string, string> = {
  'Pre sales': 'bg-amber-100 text-amber-800 border-amber-200',
  Quote: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  Lost: 'bg-red-100 text-red-800 border-red-200',
  Won: 'bg-violet-100 text-violet-800 border-violet-200',
};

/** Trigger dropdown options with colors */
export const TRIGGER_OPTIONS = [
  'Send SMS Link',
  'SMS Link Sent',
  'Number Missing',
  'Converted',
  '1 Week Reminder Sent',
  '1 Month Reminder Sent',
  '2 Month Reminder Sent',
] as const;
const TRIGGER_PILL_CLASS: Record<string, string> = {
  'Send SMS Link': 'bg-amber-100 text-amber-800 border-amber-200',
  'SMS Link Sent': 'bg-emerald-100 text-emerald-800 border-emerald-200',
  'Number Missing': 'bg-red-100 text-red-800 border-red-200',
  Converted: 'bg-blue-100 text-blue-800 border-blue-200',
  '1 Week Reminder Sent': 'bg-violet-100 text-violet-800 border-violet-200',
  '1 Month Reminder Sent': 'bg-cyan-100 text-cyan-800 border-cyan-200',
  '2 Month Reminder Sent': 'bg-orange-100 text-orange-800 border-orange-200',
};

export function QuoteTable() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [source, setSource] = useState('all');
  const [period, setPeriod] = useState('all');
  const [page, setPage] = useState(1);
  const [selectedQuote, setSelectedQuote] = useState<Quote | null>(null);
  const [statusOverrides, setStatusOverrides] = useState<Record<number, Quote['status']>>({});
  const [triggerOverrides, setTriggerOverrides] = useState<Record<number, string | null>>({});

  const filtered = useMemo(() => {
    let results = MOCK_QUOTES;

    if (search) {
      const q = search.toLowerCase();
      results = results.filter(
        (r) =>
          r.businessName.toLowerCase().includes(q) ||
          r.company?.toLowerCase().includes(q) ||
          r.contactName?.toLowerCase().includes(q) ||
          r.email?.toLowerCase().includes(q),
      );
    }
    if (status !== 'all') results = results.filter((r) => r.status === status);
    if (source !== 'all') results = results.filter((r) => r.source === source);

    return results;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, status, source, period]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const handleStatusChange = (quoteId: number, newStatus: Quote['status']) => {
    setStatusOverrides((prev) => ({ ...prev, [quoteId]: newStatus }));
  };
  const handleTriggerChange = (quoteId: number, newTrigger: string | null) => {
    setTriggerOverrides((prev) => ({ ...prev, [quoteId]: newTrigger }));
  };

  return (
    <div className="space-y-4 lg:space-y-5">
      <QuoteFilters
        search={search}
        onSearchChange={(v) => { setSearch(v); setPage(1); }}
        status={status}
        onStatusChange={(v) => { setStatus(v); setPage(1); }}
        source={source}
        onSourceChange={(v) => { setSource(v); setPage(1); }}
        period={period}
        onPeriodChange={(v) => { setPeriod(v); setPage(1); }}
      />

      <div className="relative overflow-hidden rounded-2xl border border-[var(--color-border-subtle)] bg-gradient-to-b from-[var(--color-bg-card)] to-[var(--color-bg-secondary)]">
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[var(--color-border-strong)] to-transparent" />
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[var(--color-border-subtle)]">
                <th className="text-left px-4 lg:px-6 py-4 text-[10px] font-semibold text-[var(--color-text-faint)] uppercase tracking-[0.15em]">Business Name</th>
                <th className="text-left px-4 lg:px-6 py-4 text-[10px] font-semibold text-[var(--color-text-faint)] uppercase tracking-[0.15em]">Contact</th>
                <th className="text-left px-4 lg:px-6 py-4 text-[10px] font-semibold text-[var(--color-text-faint)] uppercase tracking-[0.15em]">File</th>
                <th className="text-left px-4 lg:px-6 py-4 text-[10px] font-semibold text-[var(--color-text-faint)] uppercase tracking-[0.15em]">Date</th>
                <th className="text-left px-4 lg:px-6 py-4 text-[10px] font-semibold text-[var(--color-text-faint)] uppercase tracking-[0.15em]">Trigger</th>
                <th className="text-left px-4 lg:px-6 py-4 text-[10px] font-semibold text-[var(--color-text-faint)] uppercase tracking-[0.15em]">Source</th>
                <th className="text-left px-4 lg:px-6 py-4 text-[10px] font-semibold text-[var(--color-text-faint)] uppercase tracking-[0.15em]">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border-subtle)]">
              {paginated.map((quote) => (
                <QuoteRow
                  key={quote.id}
                  quote={quote}
                  displayStatus={statusOverrides[quote.id] ?? quote.status}
                  displayTrigger={triggerOverrides[quote.id] === undefined ? quote.trigger : (triggerOverrides[quote.id] ?? null)}
                  onStatusChange={(s) => handleStatusChange(quote.id, s)}
                  onTriggerChange={(t) => handleTriggerChange(quote.id, t)}
                  onRowClick={() =>
                    setSelectedQuote({
                      ...quote,
                      status: statusOverrides[quote.id] ?? quote.status,
                      trigger: triggerOverrides[quote.id] ?? quote.trigger,
                    })
                  }
                />
              ))}
              {paginated.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-sm text-[var(--color-text-muted)]">
                    No quotes found matching your filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between px-4 lg:px-6 py-3 border-t border-[var(--color-border-subtle)] bg-[var(--color-bg-elevated)]/50">
          <span className="text-sm text-[var(--color-text-muted)]">
            Showing {filtered.length === 0 ? 0 : (page - 1) * PAGE_SIZE + 1} to{' '}
            {Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length} quotes
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3 py-1.5 text-sm font-medium text-[var(--color-text-secondary)] bg-[var(--color-bg-card)] border border-[var(--color-border-default)] rounded-lg hover:bg-[var(--color-bg-hover)] disabled:opacity-40 disabled:pointer-events-none transition-colors"
            >
              Previous
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
              <button
                key={p}
                onClick={() => setPage(p)}
                className={`w-8 h-8 text-sm font-medium rounded-lg transition-colors ${
                  p === page
                    ? 'bg-blue-600 text-white'
                    : 'text-[var(--color-text-secondary)] bg-[var(--color-bg-card)] border border-[var(--color-border-default)] hover:bg-[var(--color-bg-hover)]'
                }`}
              >
                {p}
              </button>
            ))}
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages || totalPages === 0}
              className="px-3 py-1.5 text-sm font-medium text-[var(--color-text-secondary)] bg-[var(--color-bg-card)] border border-[var(--color-border-default)] rounded-lg hover:bg-[var(--color-bg-hover)] disabled:opacity-40 disabled:pointer-events-none transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      </div>

      <QuoteDetailDrawer quote={selectedQuote} onClose={() => setSelectedQuote(null)} />
    </div>
  );
}

function QuoteRow({
  quote,
  displayStatus,
  displayTrigger,
  onStatusChange,
  onTriggerChange,
  onRowClick,
}: {
  quote: Quote;
  displayStatus: Quote['status'];
  displayTrigger: string | null;
  onStatusChange: (s: Quote['status']) => void;
  onTriggerChange: (t: string | null) => void;
  onRowClick: () => void;
}) {
  const statusPillClass = STATUS_PILL_CLASS[displayStatus] ?? 'bg-gray-100 text-gray-700 border-gray-200';
  const triggerPillClass = displayTrigger ? (TRIGGER_PILL_CLASS[displayTrigger] ?? 'bg-gray-100 text-gray-700 border-gray-200') : '';

  return (
    <tr
      className="border-b border-[var(--color-border-subtle)] last:border-b-0 hover:bg-[var(--color-bg-hover)] transition-colors cursor-pointer"
      onClick={onRowClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onRowClick();
        }
      }}
    >
      {/* Business Name */}
      <td className="px-4 lg:px-6 py-4">
        <div className="flex items-center gap-3">
          <AvatarInitials name={quote.businessName} />
          <div className="min-w-0">
            <div className="text-sm font-medium text-[var(--color-text-primary)] truncate">{quote.businessName}</div>
            {quote.company && <div className="text-xs text-[var(--color-text-muted)] truncate">{quote.company}</div>}
          </div>
        </div>
      </td>

      {/* Contact: Name, Email, Phone in one column */}
      <td className="px-4 lg:px-6 py-4">
        <div className="min-w-0 max-w-[200px]">
          <div className="text-sm text-[var(--color-text-primary)] truncate">{quote.contactName ?? '—'}</div>
          <div className="text-xs text-[var(--color-text-muted)] truncate">{quote.email ?? '—'}</div>
          <div className="text-xs text-[var(--color-text-muted)] truncate">{quote.phone ?? '—'}</div>
        </div>
      </td>

      {/* File */}
      <td className="px-4 lg:px-6 py-4" onClick={(e) => e.stopPropagation()}>
        {quote.file ? (
          <a
            href={quote.file}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-blue-600 hover:underline text-sm"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
              <polyline points="15 3 21 3 21 9" />
              <line x1="10" y1="14" x2="21" y2="3" />
            </svg>
            Link
          </a>
        ) : (
          <span className="text-xs text-[var(--color-text-faint)]">—</span>
        )}
      </td>

      {/* Date */}
      <td className="px-4 lg:px-6 py-4">
        <div className="text-sm text-[var(--color-text-primary)]">{quote.date}</div>
        <div className="text-xs text-[var(--color-text-muted)]">{quote.time}</div>
      </td>

      {/* Trigger - dropdown with colored pill */}
      <td className="px-4 lg:px-6 py-4" onClick={(e) => e.stopPropagation()}>
        <select
          value={displayTrigger ?? ''}
          onChange={(e) => onTriggerChange(e.target.value || null)}
          className={`min-w-[140px] px-2.5 py-1.5 rounded-full border text-[11px] font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/30 cursor-pointer appearance-none bg-no-repeat bg-right ${triggerPillClass || 'bg-gray-50 text-gray-600 border-gray-200'}`}
          style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'12\' height=\'12\' viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'currentColor\' stroke-width=\'2\'%3E%3Cpath d=\'M6 9l6 6 6-6\'/%3E%3C/svg%3E")', backgroundPosition: 'right 8px center' }}
        >
          <option value="">—</option>
          {TRIGGER_OPTIONS.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      </td>

      {/* Source */}
      <td className="px-4 lg:px-6 py-4">
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-blue-500/10 text-blue-600 border border-blue-500/20">
          {quote.source}
        </span>
      </td>

      {/* Status - dropdown with colored pill (Pre sales, Quote, Lost, Won only) */}
      <td className="px-4 lg:px-6 py-4" onClick={(e) => e.stopPropagation()}>
        <select
          value={STATUS_OPTIONS.includes(displayStatus) ? displayStatus : STATUS_OPTIONS[0]}
          onChange={(e) => onStatusChange(e.target.value as Quote['status'])}
          className={`min-w-[100px] px-2.5 py-1.5 rounded-full border text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500/30 cursor-pointer appearance-none bg-no-repeat bg-right ${statusPillClass}`}
          style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'12\' height=\'12\' viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'currentColor\' stroke-width=\'2\'%3E%3Cpath d=\'M6 9l6 6 6-6\'/%3E%3C/svg%3E")', backgroundPosition: 'right 8px center' }}
        >
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      </td>
    </tr>
  );
}
