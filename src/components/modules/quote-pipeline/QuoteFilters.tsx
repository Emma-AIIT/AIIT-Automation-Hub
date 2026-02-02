'use client';

interface QuoteFiltersProps {
  search: string;
  onSearchChange: (val: string) => void;
  status: string;
  onStatusChange: (val: string) => void;
  source: string;
  onSourceChange: (val: string) => void;
  period: string;
  onPeriodChange: (val: string) => void;
}

export function QuoteFilters({
  search,
  onSearchChange,
  status,
  onStatusChange,
  source,
  onSourceChange,
  period,
  onPeriodChange,
}: QuoteFiltersProps) {
  const selectClasses =
    'h-9 rounded-lg border border-[var(--color-border-default)] bg-[var(--color-input-bg)] text-sm text-[var(--color-text-secondary)] px-3 pr-8 appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-[var(--color-border-strong)] transition-colors min-w-0 w-full sm:w-auto sm:min-w-[120px]';

  return (
    <div className="bg-[var(--color-bg-card)] border border-[var(--color-border-subtle)] rounded-2xl p-3 sm:p-4 flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center gap-3">
      {/* Search - full width on mobile */}
      <div className="relative flex-1 min-w-0 w-full sm:min-w-[200px] sm:flex-initial">
        <svg
          className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-faint)]"
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          type="text"
          placeholder="Search quotes..."
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="w-full h-9 pl-9 pr-3 rounded-lg border border-[var(--color-border-default)] bg-[var(--color-input-bg)] text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-faint)] focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-[var(--color-border-strong)] transition-colors"
        />
      </div>

      {/* Status, Source, Period - stack on mobile, row on desktop */}
      <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-3">
      <select value={status} onChange={(e) => onStatusChange(e.target.value)} className={selectClasses}>
        <option value="all">All Status</option>
        <option value="Pre sales">Pre sales</option>
        <option value="Quote">Quote</option>
        <option value="Lost">Lost</option>
        <option value="Won">Won</option>
      </select>

      {/* Source */}
      <select value={source} onChange={(e) => onSourceChange(e.target.value)} className={selectClasses}>
        <option value="all">All Sources</option>
        <option value="Email">Email</option>
        <option value="SMS">SMS</option>
        <option value="Website">Website</option>
      </select>

      {/* Period */}
      <select value={period} onChange={(e) => onPeriodChange(e.target.value)} className={selectClasses}>
        <option value="30">Last 30 days</option>
        <option value="90">Last 90 days</option>
        <option value="all">All time</option>
      </select>
      </div>
    </div>
  );
}
