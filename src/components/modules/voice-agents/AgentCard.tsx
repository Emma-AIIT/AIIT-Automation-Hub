'use client';

import { type FC } from 'react';
import type { AgentConfig } from '@/types/vapi';

interface AgentCardProps {
  config: AgentConfig;
  callsToday: number;
  status: 'active' | 'idle' | 'on-call';
  selected?: boolean;
  onClick: () => void;
}

export const AgentCard: FC<AgentCardProps> = ({ config, callsToday, status, selected, onClick }) => {
  return (
    <div
      onClick={onClick}
      className={`bg-white rounded-xl border p-6 hover:shadow-lg transition-all cursor-pointer group ${
        selected ? 'border-[var(--color-brand-orange)] shadow-md' : 'border-[var(--color-border-subtle)] hover:border-[var(--color-brand-orange)]/30'
      }`}
    >
      {/* Status Indicator */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${status === 'on-call' ? 'bg-blue-500 animate-pulse' : status === 'active' ? 'bg-emerald-500' : 'bg-gray-300'}`} />
          <span className="text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wider">
            {status}
          </span>
        </div>
        <div className="p-2 rounded-lg bg-[var(--color-accent-light)] text-[var(--color-brand-orange)] group-hover:bg-[#71b1ff]/15 transition-colors">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
          </svg>
        </div>
      </div>

      {/* Agent Info */}
      <h3 className="text-lg font-semibold text-[var(--color-brand-navy)] mb-1">{config.name}</h3>
      {config.phoneNumber && (
        <p className="text-sm text-[var(--color-text-muted)] font-mono">{config.phoneNumber}</p>
      )}
      <p className="text-xs text-[var(--color-text-faint)] mt-2">{config.description}</p>

      {/* Stats */}
      <div className="mt-4 pt-4 border-t border-[var(--color-border-subtle)] flex items-center justify-between">
        <span className="text-xs text-[var(--color-text-muted)]">Today</span>
        <span className="text-lg font-bold text-[var(--color-brand-navy)]">{callsToday}</span>
      </div>

      {/* Type Badge */}
      <div className="mt-3">
        <span className="inline-flex px-2 py-1 rounded-md text-xs font-medium bg-blue-50 text-blue-600">
          {config.type}
        </span>
      </div>
    </div>
  );
};
