import { QuoteStats } from '@/components/modules/quote-pipeline/QuoteStats';
import { QuoteTable } from '@/components/modules/quote-pipeline/QuoteTable';

export default function QuotePipelinePage() {
  return (
    <div className="p-6 space-y-6">
      {/* Header - same structure as debt recovery */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-text-primary)] tracking-tight">Quote Pipeline</h1>
          <p className="text-sm text-[var(--color-text-muted)] mt-1">Track and convert quotes from Google Sheets</p>
        </div>
        <div className="flex items-center gap-2">
          <button className="h-9 px-4 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-bg-card)] text-sm font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)] transition-colors">
            Export CSV
          </button>
          <button className="h-9 px-4 rounded-xl bg-gradient-to-r from-blue-600 to-blue-700 text-sm font-medium text-white hover:from-blue-500 hover:to-blue-600 transition-colors shadow-lg shadow-blue-500/20">
            Sync Now
          </button>
        </div>
      </div>

      {/* Stats */}
      <QuoteStats />

      {/* Table section - same structure as debt recovery */}
      <div>
        <h2 className="text-lg font-semibold text-[var(--color-text-primary)] mb-1">Quotes</h2>
        <p className="text-sm text-[var(--color-text-muted)] mb-4">Filter and manage your quote pipeline</p>
        <QuoteTable />
      </div>
    </div>
  );
}
