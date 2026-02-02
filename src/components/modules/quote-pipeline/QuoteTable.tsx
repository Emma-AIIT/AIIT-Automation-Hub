'use client';

import { useState, useMemo, useEffect } from 'react';
import type { Quote } from '@/lib/mock-data/quotes';
import { api } from '@/trpc/react';
import { AvatarInitials } from '@/components/shared/AvatarInitials';
import { QuoteFilters } from './QuoteFilters';
import { QuoteDetailDrawer } from './QuoteDetailDrawer';

const PAGE_SIZE_OPTIONS = [6, 10, 25, 50] as const;
const DEFAULT_PAGE_SIZE = 10;

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
const EMPTY_QUOTES: Quote[] = [];

const TRIGGER_PILL_CLASS: Record<string, string> = {
  'Send SMS Link': 'bg-amber-100 text-amber-800 border-amber-200',
  'SMS Link Sent': 'bg-emerald-100 text-emerald-800 border-emerald-200',
  'Number Missing': 'bg-red-100 text-red-800 border-red-200',
  Converted: 'bg-blue-100 text-blue-800 border-blue-200',
  '1 Week Reminder Sent': 'bg-violet-100 text-violet-800 border-violet-200',
  '1 Month Reminder Sent': 'bg-cyan-100 text-cyan-800 border-cyan-200',
  '2 Month Reminder Sent': 'bg-sky-100 text-sky-800 border-sky-200',
};

type SortColumn = 'date' | 'contactName' | 'businessName';
type SortDir = 'asc' | 'desc';

/** Parse DD-MM-YYYY to timestamp for sorting */
function parseQuoteDate(dateStr: string): number {
  const parts = dateStr.trim().split(/[-/]/);
  if (parts.length !== 3) return 0;
  const d = parseInt(parts[0] ?? '', 10);
  const m = parseInt(parts[1] ?? '', 10);
  const y = parseInt(parts[2] ?? '', 10);
  if (Number.isNaN(d) || Number.isNaN(m) || Number.isNaN(y)) return 0;
  return new Date(y, m - 1, d).getTime();
}

function SortableTh({
  label,
  sortKey,
  currentSortBy,
  sortDir,
  onSort,
}: {
  label: string;
  sortKey: SortColumn;
  currentSortBy: SortColumn | null;
  sortDir: SortDir;
  onSort: (key: SortColumn) => void;
}) {
  const isActive = currentSortBy === sortKey;
  return (
    <th
      className="text-left px-4 lg:px-6 py-4 text-[10px] font-semibold text-[var(--color-text-faint)] uppercase tracking-[0.15em] cursor-pointer select-none hover:text-[var(--color-text-muted)] transition-colors"
      onClick={(e) => {
        e.stopPropagation();
        onSort(sortKey);
      }}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSort(sortKey);
        }
      }}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        <span className="inline-flex flex-col -space-y-1" aria-hidden>
          <svg
            className={`h-3 w-3 ${isActive && sortDir === 'asc' ? 'text-blue-600 opacity-100' : 'opacity-40'}`}
            fill="currentColor"
            viewBox="0 0 24 24"
          >
            <path d="M7 14l5-5 5 5H7z" />
          </svg>
          <svg
            className={`h-3 w-3 -mt-0.5 ${isActive && sortDir === 'desc' ? 'text-blue-600 opacity-100' : 'opacity-40'}`}
            fill="currentColor"
            viewBox="0 0 24 24"
          >
            <path d="M7 10l5 5 5-5H7z" />
          </svg>
        </span>
      </span>
    </th>
  );
}

export function QuoteTable() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [source, setSource] = useState('all');
  const [period, setPeriod] = useState('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [sortBy, setSortBy] = useState<SortColumn | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [selectedQuote, setSelectedQuote] = useState<Quote | null>(null);
  /** Local overrides only when useMockData - edits are not persisted */
  const [statusOverrides, setStatusOverrides] = useState<Record<number, Quote['status']>>({});
  const [triggerOverrides, setTriggerOverrides] = useState<Record<number, string | null>>({});

  const { data, isLoading, isError, refetch, isRefetching } = api.quotePipeline.getRows.useQuery(
    undefined,
    { refetchInterval: 60_000 }
  );

  const utils = api.useUtils();
  const updateRow = api.quotePipeline.updateRow.useMutation({
    onSuccess: () => {
      void utils.quotePipeline.getRows.invalidate();
    },
  });

  const useMockData = data?.useMockData ?? true;

  const filtered = useMemo(() => {
    let results = data?.quotes ?? EMPTY_QUOTES;

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
  }, [data?.quotes, search, status, source]);

  const sorted = useMemo(() => {
    if (!sortBy) return filtered;
    const copy = [...filtered];
    copy.sort((a, b) => {
      let cmp = 0;
      if (sortBy === 'date') {
        cmp = parseQuoteDate(a.date) - parseQuoteDate(b.date);
      } else if (sortBy === 'businessName') {
        cmp = (a.businessName ?? '').localeCompare(b.businessName ?? '', undefined, { sensitivity: 'base' });
      } else if (sortBy === 'contactName') {
        cmp = (a.contactName ?? '').localeCompare(b.contactName ?? '', undefined, { sensitivity: 'base' });
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return copy;
  }, [filtered, sortBy, sortDir]);

  const handleSort = (key: SortColumn) => {
    if (sortBy === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(key);
      setSortDir('asc');
    }
    setPage(1);
  };

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const paginated = sorted.slice((page - 1) * pageSize, page * pageSize);

  // Reset to page 1 when page size changes or when current page exceeds total
  useEffect(() => {
    const safePage = Math.min(page, totalPages) || 1;
    if (page !== safePage) setPage(safePage);
  }, [page, totalPages, pageSize]);

  const handleStatusChange = (quote: Quote, newStatus: Quote['status']) => {
    if (useMockData) {
      setStatusOverrides((prev) => ({ ...prev, [quote.id]: newStatus }));
      return;
    }
    const rowNum = quote.rowNumber ?? quote.id;
    if (rowNum < 2) return;
    updateRow.mutate({ rowNumber: rowNum, status: newStatus });
  };

  const handleTriggerChange = (quote: Quote, newTrigger: string | null) => {
    if (useMockData) {
      setTriggerOverrides((prev) => ({ ...prev, [quote.id]: newTrigger }));
      return;
    }
    const rowNum = quote.rowNumber ?? quote.id;
    if (rowNum < 2) return;
    updateRow.mutate({ rowNumber: rowNum, trigger: newTrigger });
  };

  const displayStatus = (quote: Quote) =>
    useMockData ? (statusOverrides[quote.id] ?? quote.status) : quote.status;
  const displayTrigger = (quote: Quote) =>
    useMockData
      ? (triggerOverrides[quote.id] === undefined ? quote.trigger : (triggerOverrides[quote.id] ?? null))
      : quote.trigger;

  return (
    <div className="space-y-4 lg:space-y-5">
      {/* Mock data banner */}
      {useMockData && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 sm:px-4 py-3 text-xs sm:text-sm text-amber-800 dark:text-amber-200">
          Quote Pipeline sync not configured. Using demo data. Add Make.com webhook URLs to enable live sync.
        </div>
      )}

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
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
        <button
          onClick={() => void refetch()}
          disabled={isRefetching}
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-card)] px-3 py-2 text-sm font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)] disabled:opacity-50 transition-colors w-full sm:w-auto"
        >
          <svg
            className={`h-4 w-4 ${isRefetching ? 'animate-spin' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Refresh
        </button>
      </div>

      <div className="relative overflow-hidden rounded-2xl border border-[var(--color-border-subtle)] bg-gradient-to-b from-[var(--color-bg-card)] to-[var(--color-bg-secondary)]">
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[var(--color-border-strong)] to-transparent" />
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
          </div>
        ) : isError ? (
          <div className="py-12 text-center text-sm text-red-600 dark:text-red-400">
            Failed to load quotes. Try refreshing.
          </div>
        ) : (
          <>
            {/* Mobile: Card layout */}
            <div className="md:hidden divide-y divide-[var(--color-border-subtle)]">
              {paginated.map((quote) => (
                <QuoteCard
                  key={quote.id}
                  quote={quote}
                  displayStatus={displayStatus(quote)}
                  displayTrigger={displayTrigger(quote)}
                  onStatusChange={(s) => handleStatusChange(quote, s)}
                  onTriggerChange={(t) => handleTriggerChange(quote, t)}
                  onCardClick={() =>
                    setSelectedQuote({
                      ...quote,
                      status: displayStatus(quote),
                      trigger: displayTrigger(quote),
                    })
                  }
                  isUpdating={updateRow.isPending}
                />
              ))}
              {paginated.length === 0 && (
                <div className="px-4 py-12 text-center text-sm text-[var(--color-text-muted)]">
                  No quotes found matching your filters.
                </div>
              )}
            </div>

            {/* Desktop: Table layout */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full min-w-[700px]">
                <thead>
                  <tr className="border-b border-[var(--color-border-subtle)]">
                    <SortableTh
                      label="Business Name"
                      sortKey="businessName"
                      currentSortBy={sortBy}
                      sortDir={sortDir}
                      onSort={handleSort}
                    />
                    <SortableTh
                      label="Contact"
                      sortKey="contactName"
                      currentSortBy={sortBy}
                      sortDir={sortDir}
                      onSort={handleSort}
                    />
                    <th className="text-left px-4 lg:px-6 py-4 text-[10px] font-semibold text-[var(--color-text-faint)] uppercase tracking-[0.15em]">File</th>
                    <SortableTh
                      label="Date"
                      sortKey="date"
                      currentSortBy={sortBy}
                      sortDir={sortDir}
                      onSort={handleSort}
                    />
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
                      displayStatus={displayStatus(quote)}
                      displayTrigger={displayTrigger(quote)}
                      onStatusChange={(s) => handleStatusChange(quote, s)}
                      onTriggerChange={(t) => handleTriggerChange(quote, t)}
                      onRowClick={() =>
                        setSelectedQuote({
                          ...quote,
                          status: displayStatus(quote),
                          trigger: displayTrigger(quote),
                        })
                      }
                      isUpdating={updateRow.isPending}
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
            <div className="flex flex-col gap-3 px-3 sm:px-4 lg:px-6 py-3 border-t border-[var(--color-border-subtle)] bg-[var(--color-bg-elevated)]/50 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-col xs:flex-row flex-wrap items-start xs:items-center gap-2 sm:gap-4">
                <span className="text-xs sm:text-sm text-[var(--color-text-muted)]">
                  Showing {sorted.length === 0 ? 0 : (page - 1) * pageSize + 1}–{Math.min(page * pageSize, sorted.length)} of {sorted.length}
                </span>
                <div className="flex items-center gap-2">
                  <label htmlFor="page-size" className="text-xs sm:text-sm text-[var(--color-text-muted)]">
                    Per page:
                  </label>
                  <select
                    id="page-size"
                    value={pageSize}
                    onChange={(e) => {
                      setPageSize(Number(e.target.value) as (typeof PAGE_SIZE_OPTIONS)[number]);
                      setPage(1);
                    }}
                    className="rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-card)] px-2.5 py-1.5 text-sm text-[var(--color-text-secondary)] focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                  >
                    {PAGE_SIZE_OPTIONS.map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-center sm:justify-end gap-1 overflow-x-auto pb-1 -mb-1 min-w-0">
                <button
                  onClick={() => setPage(1)}
                  disabled={page === 1}
                  className="px-2.5 py-1.5 text-sm font-medium text-[var(--color-text-secondary)] bg-[var(--color-bg-card)] border border-[var(--color-border-default)] rounded-lg hover:bg-[var(--color-bg-hover)] disabled:opacity-40 disabled:pointer-events-none transition-colors"
                  title="First page"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
                  </svg>
                </button>
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="px-3 py-1.5 text-sm font-medium text-[var(--color-text-secondary)] bg-[var(--color-bg-card)] border border-[var(--color-border-default)] rounded-lg hover:bg-[var(--color-bg-hover)] disabled:opacity-40 disabled:pointer-events-none transition-colors"
                >
                  Previous
                </button>
                <div className="flex items-center gap-0.5">
                  {(() => {
                    const pages: (number | 'ellipsis')[] = [];
                    const maxVisible = 7;
                    if (totalPages <= maxVisible) {
                      for (let i = 1; i <= totalPages; i++) pages.push(i);
                    } else {
                      const alwaysShow = [1, totalPages];
                      const around = [page - 1, page, page + 1].filter((p) => p >= 1 && p <= totalPages);
                      const unique = [...new Set([...alwaysShow, ...around])].sort((a, b) => a - b);
                      for (let i = 0; i < unique.length; i++) {
                        if (i > 0 && unique[i]! - unique[i - 1]! > 1) pages.push('ellipsis');
                        pages.push(unique[i]!);
                      }
                    }
                    return pages.map((p, idx) =>
                      p === 'ellipsis' ? (
                        <span key={`ellipsis-${idx}`} className="px-2 py-1 text-[var(--color-text-muted)]">
                          …
                        </span>
                      ) : (
                        <button
                          key={p}
                          onClick={() => setPage(p)}
                          className={`min-w-[2rem] px-2 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                            p === page
                              ? 'bg-blue-600 text-white'
                              : 'text-[var(--color-text-secondary)] bg-[var(--color-bg-card)] border border-[var(--color-border-default)] hover:bg-[var(--color-bg-hover)]'
                          }`}
                        >
                          {p}
                        </button>
                      )
                    );
                  })()}
                </div>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages || totalPages === 0}
                  className="px-3 py-1.5 text-sm font-medium text-[var(--color-text-secondary)] bg-[var(--color-bg-card)] border border-[var(--color-border-default)] rounded-lg hover:bg-[var(--color-bg-hover)] disabled:opacity-40 disabled:pointer-events-none transition-colors"
                >
                  Next
                </button>
                <button
                  onClick={() => setPage(totalPages)}
                  disabled={page === totalPages || totalPages === 0}
                  className="px-2.5 py-1.5 text-sm font-medium text-[var(--color-text-secondary)] bg-[var(--color-bg-card)] border border-[var(--color-border-default)] rounded-lg hover:bg-[var(--color-bg-hover)] disabled:opacity-40 disabled:pointer-events-none transition-colors"
                  title="Last page"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13 5l7 7-7 7M5 5l7 7-7 7" />
                  </svg>
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      <QuoteDetailDrawer quote={selectedQuote} onClose={() => setSelectedQuote(null)} />
    </div>
  );
}

function QuoteCard({
  quote,
  displayStatus,
  displayTrigger,
  onStatusChange,
  onTriggerChange,
  onCardClick,
  isUpdating,
}: {
  quote: Quote;
  displayStatus: Quote['status'];
  displayTrigger: string | null;
  onStatusChange: (s: Quote['status']) => void;
  onTriggerChange: (t: string | null) => void;
  onCardClick: () => void;
  isUpdating?: boolean;
}) {
  const statusPillClass = STATUS_PILL_CLASS[displayStatus] ?? 'bg-gray-100 text-gray-700 border-gray-200';
  const triggerPillClass = displayTrigger ? (TRIGGER_PILL_CLASS[displayTrigger] ?? 'bg-gray-100 text-gray-700 border-gray-200') : '';

  return (
    <div
      className={`px-4 py-3 active:bg-[var(--color-bg-hover)] transition-colors cursor-pointer ${isUpdating ? 'opacity-70' : ''}`}
      onClick={onCardClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onCardClick();
        }
      }}
    >
      <div className="flex flex-col gap-3">
        <div className="flex items-start gap-2 min-w-0">
          <AvatarInitials name={quote.businessName} className="flex-shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium text-[var(--color-text-primary)] truncate">{quote.businessName}</div>
            <div className="text-xs text-[var(--color-text-muted)] truncate">{quote.contactName ?? quote.email ?? '—'}</div>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-500/10 text-blue-600 border border-blue-500/20">
                {quote.source}
              </span>
              <span className="text-[10px] text-[var(--color-text-muted)]">{quote.date}</span>
              {quote.file && (
                <a
                  href={quote.file}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="text-blue-600 hover:underline text-[10px]"
                >
                  Link
                </a>
              )}
            </div>
          </div>
        </div>
        <div className="flex flex-col sm:flex-row gap-2" onClick={(e) => e.stopPropagation()}>
          <select
            value={displayTrigger ?? ''}
            onChange={(e) => onTriggerChange(e.target.value || null)}
            disabled={isUpdating}
            className={`w-full sm:max-w-[140px] px-2 py-1.5 rounded-full border text-[10px] font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/30 cursor-pointer appearance-none bg-no-repeat disabled:opacity-60 ${triggerPillClass || 'bg-gray-50 text-gray-600 border-gray-200'}`}
            style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'10\' height=\'10\' viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'currentColor\' stroke-width=\'2\'%3E%3Cpath d=\'M6 9l6 6 6-6\'/%3E%3C/svg%3E")', backgroundPosition: 'right 8px center' }}
          >
            <option value="">—</option>
            {TRIGGER_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
          <select
            value={STATUS_OPTIONS.includes(displayStatus) ? displayStatus : STATUS_OPTIONS[0]}
            onChange={(e) => onStatusChange(e.target.value as Quote['status'])}
            disabled={isUpdating}
            className={`w-full sm:max-w-[120px] px-2 py-1.5 rounded-full border text-[10px] font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500/30 cursor-pointer appearance-none bg-no-repeat disabled:opacity-60 ${statusPillClass}`}
            style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'10\' height=\'10\' viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'currentColor\' stroke-width=\'2\'%3E%3Cpath d=\'M6 9l6 6 6-6\'/%3E%3C/svg%3E")', backgroundPosition: 'right 8px center' }}
          >
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
        </div>
      </div>
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
  isUpdating,
}: {
  quote: Quote;
  displayStatus: Quote['status'];
  displayTrigger: string | null;
  onStatusChange: (s: Quote['status']) => void;
  onTriggerChange: (t: string | null) => void;
  onRowClick: () => void;
  isUpdating?: boolean;
}) {
  const statusPillClass = STATUS_PILL_CLASS[displayStatus] ?? 'bg-gray-100 text-gray-700 border-gray-200';
  const triggerPillClass = displayTrigger ? (TRIGGER_PILL_CLASS[displayTrigger] ?? 'bg-gray-100 text-gray-700 border-gray-200') : '';

  return (
    <tr
      className={`border-b border-[var(--color-border-subtle)] last:border-b-0 hover:bg-[var(--color-bg-hover)] transition-colors cursor-pointer ${isUpdating ? 'opacity-70' : ''}`}
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
          disabled={isUpdating}
          className={`min-w-[140px] px-2.5 py-1.5 rounded-full border text-[11px] font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/30 cursor-pointer appearance-none bg-no-repeat bg-right disabled:opacity-60 disabled:cursor-not-allowed ${triggerPillClass || 'bg-gray-50 text-gray-600 border-gray-200'}`}
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
          disabled={isUpdating}
          className={`min-w-[100px] px-2.5 py-1.5 rounded-full border text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500/30 cursor-pointer appearance-none bg-no-repeat bg-right disabled:opacity-60 disabled:cursor-not-allowed ${statusPillClass}`}
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
