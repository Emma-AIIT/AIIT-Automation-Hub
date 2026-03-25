/**
 * AgentCard - Display card for a single VAPI voice agent configuration.
 * Shows the agent's name, description, live status (active/idle/on-call), and the
 * number of calls made in the selected date range.
 */
'use client';

import { type FC } from 'react';
import type { AgentConfig } from '@/types/vapi';

interface AgentCardProps {
  config: AgentConfig;
  /** Call count for the selected date range (today or last 7 days) */
  callsInPeriod: number;
  status: 'active' | 'idle' | 'on-call';
  selected?: boolean;
  onClick: () => void;
  /** Compact layout for sidebar/list so call history is visible sooner */
  compact?: boolean;
}

export const AgentCard: FC<AgentCardProps> = ({ config, callsInPeriod, status, selected, onClick, compact }) => {
  if (compact) {
    const isOutbound = config.type === 'outbound';
    return (
      <div className="relative group">
        <button
          type="button"
          onClick={onClick}
          className={`w-full text-left rounded-xl border-2 p-3.5 transition-all duration-200 ${
            selected
              ? 'border-[var(--color-brand-orange)] bg-[var(--color-accent-light)] shadow-md'
              : 'border-[var(--color-border-subtle)] bg-[var(--color-bg-card)] hover:border-[var(--color-brand-orange)]/50 hover:bg-[var(--color-bg-hover)] hover:shadow-sm'
          }`}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0 flex-1">
              <div className={`mt-0.5 w-2.5 h-2.5 shrink-0 rounded-full ring-2 ring-white shadow-sm ${status === 'on-call' ? 'bg-blue-500 animate-pulse' : status === 'active' ? 'bg-emerald-500' : 'bg-gray-400'}`} />
              <span className="text-sm font-semibold text-[var(--color-brand-navy)] truncate leading-tight">{config.name}</span>
            </div>
            <span className="text-base font-bold text-[var(--color-brand-orange)] shrink-0 tabular-nums">{callsInPeriod}</span>
          </div>
          <div className="flex items-center justify-between gap-2 mt-2.5 pt-2 border-t border-[var(--color-border-subtle)]">
            <span className="flex items-center gap-1.5 text-xs text-[var(--color-text-muted)] font-mono truncate min-w-0">
              <svg className="w-3.5 h-3.5 shrink-0 text-[var(--color-brand-orange)]/70" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
              </svg>
              {config.phoneNumber ?? ''}
            </span>
            <span className={`shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-wide ${isOutbound ? 'bg-[var(--color-accent-light)] text-[var(--color-brand-orange)]' : 'bg-emerald-50 text-emerald-700'}`}>
              {isOutbound ? (
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7 17L17 7M17 7h-10M17 7v10" />
                </svg>
              ) : (
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17 7L7 17M7 17v-10M7 17h10" />
                </svg>
              )}
              {config.type}
            </span>
          </div>
        </button>
        {config.description && (
          <div
            className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 z-10 px-3 py-2 rounded-lg bg-[var(--color-brand-navy)] text-white text-xs font-normal shadow-lg max-w-[240px] opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-150 pointer-events-none text-left"
            role="tooltip"
          >
            {config.description}
          </div>
        )}
      </div>
    );
  }

  const isOutbound = config.type === 'outbound';
  return (
    <div
      onClick={onClick}
      className={`rounded-xl border-2 p-6 transition-all duration-200 cursor-pointer group bg-[var(--color-bg-card)] ${
        selected
          ? 'border-[var(--color-brand-orange)] shadow-md bg-[var(--color-accent-light)]/30'
          : 'border-[var(--color-border-subtle)] hover:border-[var(--color-brand-orange)]/40 hover:bg-[var(--color-bg-hover)] hover:shadow-sm'
      }`}
    >
      {/* Status Indicator */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className={`w-2.5 h-2.5 rounded-full ring-2 ring-white shadow-sm ${status === 'on-call' ? 'bg-blue-500 animate-pulse' : status === 'active' ? 'bg-emerald-500' : 'bg-gray-400'}`} />
          <span className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">
            {status}
          </span>
        </div>
        <div className="p-2.5 rounded-xl bg-[var(--color-accent-light)] text-[var(--color-brand-orange)] group-hover:bg-[var(--color-brand-orange)]/15 transition-colors">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
          </svg>
        </div>
      </div>

      {/* Agent Info */}
      <h3 className="text-lg font-bold text-[var(--color-brand-navy)] mb-1">{config.name}</h3>
      {config.phoneNumber && (
        <p className="text-sm text-[var(--color-text-muted)] font-mono">{config.phoneNumber}</p>
      )}
      <p className="text-xs text-[var(--color-text-faint)] mt-2 leading-relaxed">{config.description}</p>

      {/* Stats */}
      <div className="mt-4 pt-4 border-t border-[var(--color-border-subtle)] flex items-center justify-between">
        <span className="text-xs font-medium text-[var(--color-text-muted)]">Calls</span>
        <span className="text-xl font-bold text-[var(--color-brand-orange)] tabular-nums">{callsInPeriod}</span>
      </div>

      {/* Type Badge */}
      <div className="mt-3">
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold uppercase tracking-wide ${isOutbound ? 'bg-[var(--color-accent-light)] text-[var(--color-brand-orange)]' : 'bg-emerald-50 text-emerald-700'}`}>
          {isOutbound ? (
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M7 17L17 7M17 7h-10M17 7v10" />
            </svg>
          ) : (
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 7L7 17M7 17v-10M7 17h10" />
            </svg>
          )}
          {config.type}
        </span>
      </div>
    </div>
  );
};
