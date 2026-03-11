import { QuoteStats } from '@/components/modules/quote-pipeline/QuoteStats';
import { QuoteTable } from '@/components/modules/quote-pipeline/QuoteTable';

export default function QuotePipelinePage() {
  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-6 min-w-0 overflow-x-hidden">
      {/* Header - stack on mobile */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between min-w-0">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold text-[var(--color-text-primary)] tracking-tight truncate">Proposal Pipeline</h1>
          <p className="text-sm text-[var(--color-text-muted)] mt-0.5 sm:mt-1">Track and convert proposals from Google Sheets</p>
        </div>
        <div className="flex flex-wrap gap-2 shrink-0">
          <button className="w-full sm:w-auto min-w-[120px] h-9 px-4 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-bg-card)] text-sm font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)] transition-colors">
            Export CSV
          </button>
        </div>
      </div>

      {/* Stats */}
      <QuoteStats />

      {/* Table / Cards section */}
      <div className="min-w-0">
        <h2 className="text-base sm:text-lg font-semibold text-[var(--color-text-primary)] mb-1">Proposals</h2>
        <p className="text-sm text-[var(--color-text-muted)] mb-3 sm:mb-4">Filter and manage your proposal pipeline</p>
        <QuoteTable />
      </div>
    </div>
  );
}
