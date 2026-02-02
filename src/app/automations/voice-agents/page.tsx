'use client';

import { useState } from 'react';
import { api } from '@/trpc/react';
import { AgentCard } from '@/components/modules/voice-agents/AgentCard';
import { CallLogTable } from '@/components/modules/voice-agents/CallLogTable';
import { CallDetailDrawer } from '@/components/modules/voice-agents/CallDetailDrawer';
import type { AgentConfig } from '@/types/vapi';

const AGENT_CONFIGS: AgentConfig[] = [
  { id: 'office', name: 'Office Receptionist', phoneNumber: '+61 440 132 789', assistantId: '3f46f45a-7729-4e48-b723-f41aa99ed700', type: 'inbound', description: 'Office receptionist and support' },
  { id: 'dc', name: 'DC Assistant', phoneNumber: '+61 489 264 277', assistantId: '9ed496a5-e9ad-4e2c-9c9d-62b7e5ad1330', type: 'outbound', description: 'Debt collection follow-ups' },
  { id: 'test', name: 'Test Assistant', phoneNumber: '+61 483 929 499', assistantId: 'a29660a1-ac97-46de-a0de-6f153de81789', type: 'inbound', description: 'Testing and development' },
  { id: 'ea', name: 'Exec Assistant', phoneNumber: '+61 440 138 322', assistantId: 'a6afcb05-c34d-4f9d-858d-14bff838bb1f', type: 'inbound', description: 'Executive assistant for scheduling and inquiries' },
];

export default function VoiceAgentsPage() {
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [selectedCallId, setSelectedCallId] = useState<string | null>(null);

  const { data: calls, isLoading: callsLoading } = api.vapi.getCalls.useQuery({
    assistantId: selectedAgent ?? undefined,
    limit: 100,
  }, {
    retry: false,
  });

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const { data: todayStats } = api.vapi.getCallStats.useQuery({
    dateFrom: todayStart.toISOString(),
  }, {
    retry: false,
  });

  // Build assistant ID → name map for display
  const assistantNameMap = Object.fromEntries(
    AGENT_CONFIGS.map(c => [c.assistantId, c.name])
  );

  return (
    <div className="p-6 md:p-8 space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl md:text-3xl font-bold text-[var(--color-brand-navy)] tracking-tight">Voice Agents</h1>
        <p className="text-sm text-[var(--color-text-muted)] mt-1">Manage VAPI assistants and call history</p>
      </div>

      {/* Agent Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {AGENT_CONFIGS.map((config) => {
          const agentCalls = calls?.filter(c => c.assistantId === config.assistantId) ?? [];
          const todayCalls = agentCalls.filter(c => {
            const d = new Date(c.startedAt);
            return !isNaN(d.getTime()) && d >= todayStart;
          });
          const hasActiveCall = agentCalls.some(c => c.status === 'in-progress');

          return (
            <AgentCard
              key={config.id}
              config={config}
              callsToday={todayCalls.length}
              status={hasActiveCall ? 'on-call' : todayCalls.length > 0 ? 'active' : 'idle'}
              onClick={() => setSelectedAgent(
                selectedAgent === config.assistantId ? null : config.assistantId || null
              )}
              selected={selectedAgent === config.assistantId}
            />
          );
        })}
      </div>

      {/* Status Legend */}
      <p className="text-xs italic text-[var(--color-text-faint)] -mt-4 flex items-center gap-4">
        <span className="flex items-center gap-1.5"><span className="inline-block w-2 h-2 rounded-full bg-blue-500" /> On call — currently in a live call</span>
        <span className="flex items-center gap-1.5"><span className="inline-block w-2 h-2 rounded-full bg-emerald-500" /> Active — has calls today</span>
        <span className="flex items-center gap-1.5"><span className="inline-block w-2 h-2 rounded-full bg-gray-300" /> Idle — no calls today</span>
      </p>

      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
        <div className="bg-white rounded-xl border border-[var(--color-border-subtle)] p-6">
          <p className="text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wider">Calls Today</p>
          <p className="text-3xl font-bold text-[var(--color-brand-navy)] mt-2">{todayStats?.totalCalls ?? 0}</p>
        </div>
        <div className="bg-white rounded-xl border border-[var(--color-border-subtle)] p-6">
          <p className="text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wider">Completed</p>
          <p className="text-3xl font-bold text-emerald-600 mt-2">{todayStats?.completedCalls ?? 0}</p>
        </div>
        <div className="bg-white rounded-xl border border-[var(--color-border-subtle)] p-6">
          <p className="text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wider">Failed</p>
          <p className="text-3xl font-bold text-rose-600 mt-2">{todayStats?.failedCalls ?? 0}</p>
        </div>
        <div className="bg-white rounded-xl border border-[var(--color-border-subtle)] p-6">
          <p className="text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wider">Total Cost</p>
          <p className="text-3xl font-bold text-[var(--color-brand-navy)] mt-2">${(todayStats?.totalCost ?? 0).toFixed(2)}</p>
        </div>
      </div>

      {/* Call Log Table */}
      <div className="bg-white rounded-xl border border-[var(--color-border-subtle)] p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-[var(--color-brand-navy)]">Call History</h2>
          {selectedAgent && (
            <button
              onClick={() => setSelectedAgent(null)}
              className="text-sm text-[var(--color-brand-orange)] hover:underline"
            >
              Show all agents
            </button>
          )}
        </div>

        <CallLogTable
          calls={calls ?? []}
          loading={callsLoading}
          onCallClick={(callId) => setSelectedCallId(callId)}
          assistantNameMap={assistantNameMap}
        />
      </div>

      {/* Call Detail Drawer */}
      {selectedCallId && (
        <CallDetailDrawer
          callId={selectedCallId}
          onClose={() => setSelectedCallId(null)}
        />
      )}
    </div>
  );
}
