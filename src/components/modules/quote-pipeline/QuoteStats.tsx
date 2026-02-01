'use client';

import { api } from '@/trpc/react';
import { StatsCard } from '@/components/dashboard/StatsCard';

export function QuoteStats() {
  const { data } = api.quotePipeline.getRows.useQuery();
  const quotes = data?.quotes ?? [];

  const totalQuotes = quotes.length;
  const pipelineValue = quotes.reduce((sum, q) => sum + q.value, 0);
  const wonQuotes = quotes.filter((q) => q.status === 'Won').length;
  const winRate = totalQuotes > 0 ? ((wonQuotes / totalQuotes) * 100).toFixed(1) : '0';

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <StatsCard
        title="Total Quotes"
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
        title="Pipeline Value"
        value={`$${(pipelineValue / 1000).toFixed(1)}K`}
        subtitle="Total quoted"
        icon={
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
          </svg>
        }
      />
      <StatsCard
        title="Won Quotes"
        value={wonQuotes}
        subtitle="Converted"
        icon={
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        }
      />
      <StatsCard
        title="Win Rate"
        value={`${winRate}%`}
        subtitle="Conversion"
        trend={{ value: '+4.2%', positive: true }}
        icon={
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
            <polyline points="17 6 23 6 23 12" />
          </svg>
        }
      />
    </div>
  );
}
