/**
 * QuoteStats - Summary stats bar for the quote pipeline module.
 * Fetches all quotes via tRPC and derives totals for total value, won, lost, and in-progress
 * quotes, rendering each as a StatsCard with a skeleton loader while data is fetching.
 */
'use client';

import { api } from '@/trpc/react';
import { StatsCard } from '@/components/dashboard/StatsCard';
import { SkeletonQuoteStats } from '@/components/ui/Skeleton';

export function QuoteStats() {
  const { data, isLoading } = api.quotePipeline.getRows.useQuery();
  const quotes = data?.quotes ?? [];

  const totalQuotes = quotes.length;
  const activeQuotes = quotes.filter((q) => q.status === 'Quote').length;
  const wonQuotes = quotes.filter((q) => q.status === 'Won').length;

  if (isLoading) {
    return <SkeletonQuoteStats />;
  }

  return (
    <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
      <StatsCard
        title="Total Proposals"
        value={totalQuotes}
        subtitle="All time"
        icon={
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
          </svg>
        }
      />
      <StatsCard
        title="Active Proposals"
        value={activeQuotes}
        subtitle="In pipeline"
        icon={
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
        }
      />
      <StatsCard
        title="Won Proposals"
        value={wonQuotes}
        subtitle="Converted"
        icon={
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        }
      />
    </div>
  );
}
