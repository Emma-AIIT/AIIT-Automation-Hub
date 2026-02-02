'use client';

import { useState, useMemo } from 'react';
import { api } from '@/trpc/react';
import { AgentCard } from '@/components/modules/voice-agents/AgentCard';
import { CallLogTable } from '@/components/modules/voice-agents/CallLogTable';
import { CallDetailDrawer } from '@/components/modules/voice-agents/CallDetailDrawer';
import type { AgentConfig } from '@/types/vapi';

const AGENT_CONFIGS: AgentConfig[] = [
  { id: 'office', name: 'Office Receptionist', phoneNumber: '+61 440 132 789', assistantId: '3f46f45a-7729-4e48-b723-f41aa99ed700', type: 'inbound', description: 'Office receptionist and support' },
  { id: 'dc', name: 'DC Assistant', phoneNumber: '+61 489 264 277', assistantId: '9ed496a5-e9ad-4e2c-9c9d-62b7e5ad1330', type: 'outbound', description: 'Debt collection follow-ups' },
  { id: 'test', name: 'Test Assistant', phoneNumber: '+61 483 929 499', assistantId: 'a29660a1-ac97-46de-a0de-6f153de81789', type: 'inbound', description: 'Calling all other agents to check if they are active' },
  { id: 'ea', name: 'Exec Assistant', phoneNumber: '+61 440 138 322', assistantId: 'a6afcb05-c34d-4f9d-858d-14bff838bb1f', type: 'inbound', description: 'Executive assistant for scheduling and inquiries' },
  { id: 'ali-ai', name: 'alitaufeek.com Ali AI 2.0', phoneNumber: '+61 440 138 322', assistantId: '0e1bcd6f-8476-4f6d-88b7-00f929ef485f', type: 'outbound', description: 'Calls new leads from alitaufeek.com form submissions to engage and gather info' },
];

type DatePreset = 'today' | '7d';

const DATE_PRESETS: { value: DatePreset; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: '7d', label: 'Last 7 days' },
];

function getDateRange(preset: DatePreset): { dateFrom: string; dateTo: string } {
  const now = new Date();
  const dateTo = new Date(now);
  dateTo.setSeconds(59, 999);

  const dateFrom = new Date(now);
  if (preset === 'today') {
    dateFrom.setHours(0, 0, 0, 0);
  } else {
    dateFrom.setDate(dateFrom.getDate() - 7);
    dateFrom.setHours(0, 0, 0, 0);
  }
  return { dateFrom: dateFrom.toISOString(), dateTo: dateTo.toISOString() };
}

export default function VoiceAgentsPage() {
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [selectedCallId, setSelectedCallId] = useState<string | null>(null);
  const [datePreset, setDatePreset] = useState<DatePreset>('today');

  const { dateFrom, dateTo } = useMemo(() => getDateRange(datePreset), [datePreset]);

  // Fetch all calls in the selected date range so agent cards can show per-agent counts
  const { data: allCalls, isLoading: callsLoading } = api.vapi.getCalls.useQuery({
    limit: 100,
    createdAtGt: dateFrom,
    createdAtLt: dateTo,
  }, {
    retry: false,
  });

  // For the table: show all calls or filter by selected agent
  const calls = selectedAgent
    ? (allCalls ?? []).filter((c) => c.assistantId === selectedAgent)
    : (allCalls ?? []);

  const { data: stats } = api.vapi.getCallStats.useQuery({
    assistantId: selectedAgent ?? undefined,
    dateFrom,
    dateTo,
  }, {
    retry: false,
  });

  // Build assistant ID → name map for display
  const assistantNameMap = Object.fromEntries(
    AGENT_CONFIGS.map(c => [c.assistantId, c.name])
  );

  const selectedAgentName = selectedAgent ? assistantNameMap[selectedAgent] : null;

  const agentCardProps = (config: AgentConfig) => {
    const agentCalls = (allCalls ?? []).filter((c) => c.assistantId === config.assistantId);
    const hasActiveCall = agentCalls.some((c) => c.status === 'in-progress');
    return {
      config,
      callsInPeriod: agentCalls.length,
      status: (hasActiveCall ? 'on-call' : agentCalls.length > 0 ? 'active' : 'idle') as 'on-call' | 'active' | 'idle',
      selected: selectedAgent === config.assistantId,
      onClick: () => setSelectedAgent(selectedAgent === config.assistantId ? null : config.assistantId ?? null),
    };
  };

  return (
    <div className="p-4 md:p-6 lg:p-8">
      {/* Header */}
      <div className="mb-4 md:mb-6">
        <h1 className="text-2xl md:text-3xl font-bold text-[var(--color-brand-navy)] tracking-tight">Voice Agents</h1>
        <p className="text-sm text-[var(--color-text-muted)] mt-1">Manage VAPI assistants and call history</p>
      </div>

      <div className="flex flex-col lg:flex-row gap-6 lg:gap-8">
        {/* Agent list — compact sidebar on lg+, horizontal scroll on smaller */}
        <div className="lg:w-56 xl:w-64 shrink-0">
          <p className="text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wider mb-2">Agents</p>
          <div className="flex lg:flex-col gap-2 overflow-x-auto pb-2 lg:pb-0 lg:overflow-visible">
            {AGENT_CONFIGS.map((config) => (
              <div key={config.id} className="shrink-0 w-52 lg:w-full">
                <AgentCard {...agentCardProps(config)} compact />
              </div>
            ))}
          </div>
          <p className="text-xs italic text-[var(--color-text-faint)] mt-2 hidden lg:block">
            Click an agent to filter call history
          </p>
          {/* Status legend */}
          <p className="text-xs text-[var(--color-text-faint)] mt-3 pt-3 border-t border-[var(--color-border-subtle)] flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="flex items-center gap-1.5"><span className="inline-block w-2 h-2 rounded-full bg-blue-500" /> On call</span>
            <span className="flex items-center gap-1.5"><span className="inline-block w-2 h-2 rounded-full bg-emerald-500" /> Active</span>
            <span className="flex items-center gap-1.5"><span className="inline-block w-2 h-2 rounded-full bg-gray-300" /> Idle</span>
            <span className="flex items-center gap-1.5"><span className="inline-block w-2 h-2 rounded-full bg-rose-500" /> Error</span>
          </p>
        </div>

        {/* Main: stats + call history */}
        <div className="flex-1 min-w-0 space-y-4 md:space-y-6">
          {/* Stats Row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
            <div className="bg-white rounded-xl border border-[var(--color-border-subtle)] p-4">
              <p className="text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wider">
                Calls {selectedAgentName ? `· ${selectedAgentName}` : ''}
              </p>
              <p className="text-2xl md:text-3xl font-bold text-[var(--color-brand-navy)] mt-1">{stats?.totalCalls ?? 0}</p>
            </div>
            <div className="bg-white rounded-xl border border-[var(--color-border-subtle)] p-4">
              <p className="text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wider">Completed</p>
              <p className="text-2xl md:text-3xl font-bold text-emerald-600 mt-1">{stats?.completedCalls ?? 0}</p>
            </div>
            <div className="bg-white rounded-xl border border-[var(--color-border-subtle)] p-4">
              <p className="text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wider">Failed</p>
              <p className="text-2xl md:text-3xl font-bold text-rose-600 mt-1">{stats?.failedCalls ?? 0}</p>
            </div>
            <div className="bg-white rounded-xl border border-[var(--color-border-subtle)] p-4">
              <p className="text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wider">Total Cost</p>
              <p className="text-2xl md:text-3xl font-bold text-[var(--color-brand-navy)] mt-1">${(stats?.totalCost ?? 0).toFixed(2)}</p>
            </div>
          </div>

          {/* Call Log Table */}
          <div className="bg-white rounded-xl border border-[var(--color-border-subtle)] p-4 md:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <h2 className="text-lg font-semibold text-[var(--color-brand-navy)]">Call History</h2>
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-xs text-[var(--color-text-muted)]">Date range:</span>
            <div className="inline-flex rounded-lg border border-[var(--color-border-subtle)] p-0.5 bg-[var(--color-accent-light)]/30">
              {DATE_PRESETS.map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setDatePreset(value)}
                  className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                    datePreset === value
                      ? 'bg-white text-[var(--color-brand-navy)] shadow-sm'
                      : 'text-[var(--color-text-muted)] hover:text-[var(--color-brand-navy)]'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            {selectedAgent && (
              <button
                onClick={() => setSelectedAgent(null)}
                className="text-sm text-[var(--color-brand-orange)] hover:underline ml-1"
              >
                Show all agents
              </button>
            )}
          </div>
        </div>
        {selectedAgent && (
          <p className="text-xs text-[var(--color-text-faint)] -mt-2 mb-2">
            Showing calls for <strong>{selectedAgentName ?? 'this agent'}</strong>. Click an agent in the list to filter by another.
          </p>
        )}

        <CallLogTable
          calls={calls ?? []}
          loading={callsLoading}
          onCallClick={(callId) => setSelectedCallId(callId)}
          assistantNameMap={assistantNameMap}
        />
          </div>
        </div>
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
