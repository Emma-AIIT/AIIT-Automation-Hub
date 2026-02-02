'use client';

import { type FC } from 'react';
import Link from 'next/link';

interface AgentInfo {
  id: string;
  name: string;
  phoneNumber: string;
  status: 'active' | 'idle';
  callsToday: number;
}

const AGENTS: AgentInfo[] = [
  { id: 'ea', name: 'EA Assistant', phoneNumber: '+61 440 138 322', status: 'active', callsToday: 8 },
  { id: 'office', name: 'Office Support', phoneNumber: '+61 440 132 789', status: 'idle', callsToday: 5 },
  { id: 'dc', name: 'DC Assistant', phoneNumber: '+61 489 264 277', status: 'active', callsToday: 11 },
  { id: 'status', name: 'Status Check', phoneNumber: '', status: 'idle', callsToday: 0 },
];

export const AgentStatusCards: FC = () => {
  return (
    <div className="bg-white rounded-2xl border border-[var(--color-border-subtle)] p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">Voice Agents</h3>
        <Link href="/automations/voice-agents" className="text-xs text-[var(--color-brand-orange)] hover:underline">
          View all
        </Link>
      </div>
      <div className="space-y-3">
        {AGENTS.map((agent) => (
          <Link
            key={agent.id}
            href="/automations/voice-agents"
            className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 transition-colors group"
          >
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <div className={`w-2 h-2 rounded-full ${agent.status === 'active' ? 'bg-emerald-500' : 'bg-gray-300'}`} />
              <div className="min-w-0">
                <p className="text-sm font-medium text-[var(--color-text-primary)] truncate">{agent.name}</p>
                {agent.phoneNumber && (
                  <p className="text-[10px] text-[var(--color-text-faint)] font-mono">{agent.phoneNumber}</p>
                )}
              </div>
            </div>
            <span className="text-sm font-semibold text-[var(--color-text-secondary)]">{agent.callsToday}</span>
          </Link>
        ))}
      </div>
    </div>
  );
};
