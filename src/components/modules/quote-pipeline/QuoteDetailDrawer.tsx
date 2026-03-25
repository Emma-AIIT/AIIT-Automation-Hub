/**
 * QuoteDetailDrawer - Slide-in drawer that displays the full details of a selected quote.
 * Renders quote metadata, status, source, and line items for the quote pipeline module.
 * Closes when the user clicks outside or triggers the onClose callback.
 */
'use client';

import type { Quote } from '@/lib/mock-data/quotes';

interface QuoteDetailDrawerProps {
  quote: Quote | null;
  onClose: () => void;
}

export function QuoteDetailDrawer({ quote, onClose }: QuoteDetailDrawerProps) {
  if (!quote) return null;

  const detailRow = (label: string, value: React.ReactNode) => (
    <div className="flex flex-col gap-1 py-3 border-b border-[var(--color-border-subtle)] last:border-b-0">
      <span className="text-[10px] font-semibold text-[var(--color-text-faint)] uppercase tracking-[0.1em]">{label}</span>
      <span className="text-sm text-[var(--color-text-primary)]">{value ?? '—'}</span>
    </div>
  );

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-[var(--color-backdrop)] z-40 transition-opacity"
        onClick={onClose}
        aria-hidden
      />
      {/* Drawer - full screen on mobile, side panel on desktop */}
      <div
        className="fixed top-0 right-0 bottom-0 w-full sm:max-w-md bg-[var(--color-bg-card)] border-l border-[var(--color-border-default)] shadow-xl z-50 flex flex-col overflow-hidden"
        role="dialog"
        aria-modal="true"
        aria-labelledby="quote-detail-title"
      >
        <div className="flex items-center justify-between px-4 sm:px-5 py-4 border-b border-[var(--color-border-subtle)] pt-[max(1rem,env(safe-area-inset-top))] sm:pt-4">
          <h2 id="quote-detail-title" className="text-lg font-semibold text-[var(--color-text-primary)] truncate pr-4">
            {quote.businessName}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)] transition-colors"
            aria-label="Close"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 sm:px-5 py-4 pb-[env(safe-area-inset-bottom)]">
          {detailRow('Business Name', quote.businessName)}
          {detailRow('Name', quote.contactName ?? quote.company)}
          {detailRow('Email', quote.email ? <a href={`mailto:${quote.email}`} className="text-blue-600 hover:underline">{quote.email}</a> : null)}
          {detailRow('Phone Number', quote.phone)}
          {detailRow('Date', `${quote.date} ${quote.time}`)}
          {detailRow('Trigger', quote.trigger)}
          {detailRow('Source', quote.source)}
          {detailRow('Status', quote.status)}

          {detailRow(
            'Dropbox File Path',
            quote.dropboxFilePath ? (
              <span className="font-mono text-xs break-all">{quote.dropboxFilePath}</span>
            ) : null
          )}
          {detailRow(
            'Dropbox Link',
            quote.file ? (
              <a
                href={quote.file}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline break-all text-xs"
              >
                {quote.file}
              </a>
            ) : null
          )}
        </div>
      </div>
    </>
  );
}
