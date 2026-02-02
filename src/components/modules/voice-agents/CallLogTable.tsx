'use client';

import { type FC } from 'react';
import { format } from 'date-fns';
import type { VapiCall } from '@/types/vapi';
import { getEffectiveCallStatus } from '@/lib/vapi-call-status';

interface CallLogTableProps {
  calls: VapiCall[];
  loading: boolean;
  onCallClick: (callId: string) => void;
  assistantNameMap?: Record<string, string>;
}

const safeFormatTime = (dateStr: string | null | undefined): string => {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '-';
  return format(d, 'd MMM yyyy, h:mm a');
};

const formatDuration = (startedAt: string, endedAt: string | null) => {
  if (!endedAt || !startedAt) return '-';
  const start = new Date(startedAt).getTime();
  const end = new Date(endedAt).getTime();
  if (isNaN(start) || isNaN(end)) return '-';
  const seconds = Math.floor((end - start) / 1000);
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
};

const getStatusColor = (status: string) => {
  switch (status) {
    case 'completed':
    case 'ended': return 'bg-emerald-50 text-emerald-700';
    case 'in-progress': return 'bg-blue-50 text-blue-700';
    case 'failed': return 'bg-rose-50 text-rose-700';
    case 'no-answer':
    case 'busy': return 'bg-gray-100 text-gray-700';
    default: return 'bg-gray-100 text-gray-700';
  }
};

const getEndedReasonColor = (reason: string | undefined) => {
  if (!reason) return 'bg-gray-100 text-gray-600';
  const r = reason.toLowerCase();
  if (r.includes('customer')) return 'bg-blue-50 text-blue-700';
  if (r.includes('assistant')) return 'bg-emerald-50 text-emerald-700';
  if (r.includes('silence')) return 'bg-amber-50 text-amber-700';
  if (r.includes('error') || r.includes('fail')) return 'bg-rose-50 text-rose-700';
  return 'bg-gray-100 text-gray-600';
};

const formatEndedReason = (reason: string | undefined) => {
  if (!reason) return '-';
  return reason
    .replace(/-/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
};

export const CallLogTable: FC<CallLogTableProps> = ({ calls, loading, onCallClick, assistantNameMap }) => {
  if (loading) {
    return <div className="text-center py-12 text-[var(--color-text-muted)]">Loading calls...</div>;
  }

  if (calls.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-[var(--color-text-muted)]">No calls found</p>
        <p className="text-xs text-[var(--color-text-faint)] mt-1">Calls will appear here once VAPI is configured</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-[var(--color-border-subtle)]">
            <th className="text-left py-3 px-4 text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wider">Time</th>
            <th className="text-left py-3 px-4 text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wider">Assistant</th>
            <th className="text-left py-3 px-4 text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wider">Number</th>
            <th className="text-left py-3 px-4 text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wider">Type</th>
            <th className="text-left py-3 px-4 text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wider">Status</th>
            <th className="text-left py-3 px-4 text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wider">Ended Reason</th>
            <th className="text-left py-3 px-4 text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wider">Duration</th>
            <th className="text-left py-3 px-4 text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wider">Cost</th>
          </tr>
        </thead>
        <tbody>
          {calls.map((call) => (
            <tr
              key={call.id}
              onClick={() => onCallClick(call.id)}
              className="border-b border-[var(--color-border-subtle)] last:border-b-0 hover:bg-gray-50 cursor-pointer transition-colors"
            >
              <td className="py-3 px-4 text-sm text-[var(--color-text-primary)]">
                {safeFormatTime(call.startedAt)}
              </td>
              <td className="py-3 px-4 text-sm font-medium text-[var(--color-brand-navy)]">
                {assistantNameMap?.[call.assistantId] ?? call.assistantId?.slice(0, 8) ?? '-'}
              </td>
              <td className="py-3 px-4 text-sm font-mono text-[var(--color-text-primary)]">
                {call.customer?.number ?? '-'}
              </td>
              <td className="py-3 px-4 text-sm text-[var(--color-text-muted)]">
                {call.type === 'inboundPhoneCall' ? 'Inbound' : call.type === 'outboundPhoneCall' ? 'Outbound' : 'Web'}
              </td>
              <td className="py-3 px-4">
                <span className={`inline-flex px-2 py-1 rounded-md text-xs font-medium ${getStatusColor(getEffectiveCallStatus(call))}`}>
                  {getEffectiveCallStatus(call)}
                </span>
              </td>
              <td className="py-3 px-4">
                <span className={`inline-flex px-2 py-1 rounded-md text-xs font-medium ${getEndedReasonColor(call.endedReason)}`}>
                  {formatEndedReason(call.endedReason)}
                </span>
              </td>
              <td className="py-3 px-4 text-sm text-[var(--color-text-muted)]">
                {formatDuration(call.startedAt, call.endedAt)}
              </td>
              <td className="py-3 px-4 text-sm font-medium text-[var(--color-text-primary)]">
                ${call.cost?.toFixed(3) ?? '-'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
