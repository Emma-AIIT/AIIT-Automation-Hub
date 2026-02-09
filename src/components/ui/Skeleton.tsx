'use client';

import { type FC, type HTMLAttributes } from 'react';

interface SkeletonProps extends HTMLAttributes<HTMLDivElement> {
  /** Optional className; skeleton always includes shimmer animation */
  className?: string;
}

/**
 * Base skeleton primitive with shimmer animation.
 * Use for any loading placeholder to give a sense of snappiness.
 */
export const Skeleton: FC<SkeletonProps> = ({ className = '', style, ...props }) => {
  return (
    <div
      className={`animate-skeleton-shimmer rounded ${className}`}
      style={{ ...style }}
      aria-hidden
      {...props}
    />
  );
};

/** Skeleton that matches a StatsCard layout (icon + title + value + subtitle) */
export function SkeletonStatsCard() {
  return (
    <div className="group relative overflow-hidden rounded-2xl bg-white border border-[var(--color-border-subtle)] p-5">
      <div className="relative flex items-start justify-between">
        <div className="flex-1 space-y-3">
          <div className="flex items-center gap-2.5">
            <Skeleton className="w-8 h-8 shrink-0 rounded-lg" />
            <Skeleton className="h-3 w-20" />
          </div>
          <Skeleton className="h-8 w-24 md:h-9 md:w-28" />
          <Skeleton className="h-3 w-16" />
        </div>
      </div>
    </div>
  );
}

/** Row of 4 stat cards (dashboard / tickets / voice agents) */
export function SkeletonStatsRow({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonStatsCard key={i} />
      ))}
    </div>
  );
}

/** Skeleton for a table: header row + body rows */
export function SkeletonTable({
  rows = 6,
  cols = 6,
  showHeader = true,
}: {
  rows?: number;
  cols?: number;
  showHeader?: boolean;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[600px]">
        {showHeader && (
          <thead>
            <tr className="border-b border-[var(--color-border-subtle)]">
              {Array.from({ length: cols }).map((_, i) => (
                <th key={i} className="text-left py-3 px-4">
                  <Skeleton className="h-3 w-16" />
                </th>
              ))}
            </tr>
          </thead>
        )}
        <tbody className="divide-y divide-[var(--color-border-subtle)]">
          {Array.from({ length: rows }).map((_, rowIdx) => (
            <tr key={rowIdx}>
              {Array.from({ length: cols }).map((_, colIdx) => (
                <td key={colIdx} className="py-3 px-4">
                  <Skeleton
                    className="h-4"
                    style={{ width: colIdx === 0 ? 120 : colIdx === cols - 1 ? 48 : 100 }}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Skeleton for the VAPI metrics chart area (two side-by-side charts) */
export function SkeletonChart() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
      {[1, 2].map((i) => (
        <div key={i} className="rounded-2xl overflow-hidden bg-white border border-[var(--color-border-subtle)]">
          <div className="p-5 pb-2 space-y-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-9 w-20" />
          </div>
          <div className="w-full h-[200px] flex items-end gap-1 px-4 pb-4">
            {[40, 65, 55, 80, 45, 70, 50, 60, 75, 55, 65, 50].map((pct, j) => (
              <Skeleton
                key={j}
                className="flex-1 min-w-[4px] rounded-t"
                style={{ height: `${pct}%` }}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Skeleton for 3 stat cards in a row (e.g. Quote Pipeline) */
export function SkeletonQuoteStats() {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
      {[1, 2, 3].map((i) => (
        <SkeletonStatsCard key={i} />
      ))}
    </div>
  );
}
