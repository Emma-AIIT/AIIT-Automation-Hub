/**
 * StatsCard
 * A single metric card displaying a title, value, optional subtitle, icon, and trend badge.
 * The trend badge renders green for positive changes and red for negative ones.
 * Includes a shimmer hover effect and a decorative corner gradient.
 */
'use client';

import { type FC, type ReactNode } from 'react';

interface StatsCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: ReactNode;
  trend?: {
    value: string;
    positive: boolean;
  };
}

export const StatsCard: FC<StatsCardProps> = ({ title, value, subtitle, icon, trend }) => {
  return (
    <div className="group relative overflow-hidden rounded-2xl bg-white border border-[var(--color-border-subtle)] p-5 transition-all duration-300 hover:border-[var(--color-border-default)] hover:shadow-md">
      {/* Subtle shimmer effect on hover */}
      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none">
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-[var(--color-shimmer)] to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />
      </div>

      <div className="relative flex items-start justify-between">
        <div className="flex-1 space-y-3">
          {/* Header with icon */}
          <div className="flex items-center gap-2.5">
            {icon && (
              <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-[var(--color-accent-light)] border border-[#71b1ff]/40 flex items-center justify-center text-[var(--color-brand-orange)] group-hover:border-[#50a1fe]/50 transition-colors">
                {icon}
              </div>
            )}
            <p className="text-[11px] font-medium text-[var(--color-text-muted)] uppercase tracking-[0.1em]">{title}</p>
          </div>

          {/* Value */}
          <p className="text-2xl md:text-3xl font-bold text-[var(--color-text-primary)] tracking-tight leading-none">
            {value}
          </p>

          {/* Subtitle */}
          {subtitle && (
            <p className="text-xs text-[var(--color-text-faint)]">{subtitle}</p>
          )}
        </div>

        {/* Trend Badge */}
        {trend && (
          <div className={`flex-shrink-0 px-2.5 py-1 rounded-lg text-xs font-semibold tracking-wide ${
            trend.positive
              ? 'bg-emerald-50 text-emerald-600 border border-emerald-200/50'
              : 'bg-rose-50 text-rose-600 border border-rose-200/50'
          }`}>
            <span className="flex items-center gap-1">
              {trend.positive ? (
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="18 15 12 9 6 15" />
                </svg>
              ) : (
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              )}
              {trend.value}
            </span>
          </div>
        )}
      </div>

      {/* Corner decoration */}
      <div className="absolute -bottom-8 -right-8 w-24 h-24 rounded-full bg-gradient-to-br from-[#50a1fe]/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
    </div>
  );
};
