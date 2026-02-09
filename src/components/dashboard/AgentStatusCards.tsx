'use client';

import { type FC } from 'react';
import Link from 'next/link';
import { Skeleton } from '@/components/ui/Skeleton';

export interface AgentStatusItem {
  id: string;
  name: string;
  phoneNumber: string;
  status: 'active' | 'idle' | 'on-call';
  callsInPeriod: number;
}

interface AgentStatusCardsProps {
  agents?: AgentStatusItem[];
  isLoading?: boolean;
}

export const AgentStatusCards: FC<AgentStatusCardsProps> = ({ agents = [], isLoading = false }) => {
  return (
    <div className="h-full flex flex-col bg-white rounded-2xl border border-[var(--color-border-subtle)] p-6">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">Voice Agents</h3>
        <Link href="/automations/voice-agents" className="text-xs text-[var(--color-brand-orange)] hover:underline">
          View all
        </Link>
      </div>
      <p className="text-[10px] text-[var(--color-text-faint)] mb-3">Numbers = calls in last 24 hours</p>
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="flex items-center gap-3 p-3 rounded-xl">
              <Skeleton className="w-2 h-2 rounded-full shrink-0" />
              <div className="flex-1 min-w-0 space-y-1">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-3 w-28" />
              </div>
              <Skeleton className="h-4 w-6 shrink-0" />
            </div>
          ))}
        </div>
      ) : agents.length === 0 ? (
        <p className="text-sm text-[var(--color-text-muted)] py-2">No agents configured</p>
      ) : (
        <div className="space-y-3">
          {agents.map((agent) => (
            <Link
              key={agent.id}
              href="/automations/voice-agents"
              className="flex items-center gap-3 p-3 rounded-xl hover:bg-[var(--color-bg-hover)] transition-colors group"
            >
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <div className={`w-2 h-2 rounded-full shrink-0 ${agent.status === 'on-call' ? 'bg-blue-500 animate-pulse' : agent.status === 'active' ? 'bg-emerald-500' : 'bg-gray-300'}`} />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-[var(--color-text-primary)] truncate">{agent.name}</p>
                  {agent.phoneNumber && (
                    <p className="text-[10px] text-[var(--color-text-faint)] font-mono">{agent.phoneNumber}</p>
                  )}
                </div>
              </div>
              <span className="text-sm font-semibold text-[var(--color-text-secondary)] tabular-nums">{agent.callsInPeriod}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
};
