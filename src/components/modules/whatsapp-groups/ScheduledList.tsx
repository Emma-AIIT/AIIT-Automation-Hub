/**
 * ScheduledList - List of pending scheduled WhatsApp broadcast messages.
 * Fetches upcoming scheduled messages for a given account via tRPC and renders each
 * entry with its send time (Sydney timezone), target groups, message preview, and a cancel action.
 */
'use client';

import { formatInTimeZone } from 'date-fns-tz';
import { api } from '@/trpc/react';
import toast from 'react-hot-toast';
import type { ScheduledMessage } from '@/server/api/routers/whatsapp';
import type { WhatsAppAccountId } from '@/lib/config/whatsapp-accounts';

const SYDNEY_TZ = 'Australia/Sydney';

function formatSydneyTime(isoString: string): string {
  return formatInTimeZone(new Date(isoString), SYDNEY_TZ, "EEE d MMM · h:mm a zzz");
}

const STATUS_STYLES: Record<ScheduledMessage['status'], { dot: string; label: string; badge: string }> = {
  pending: { dot: 'bg-blue-400', label: 'Scheduled', badge: 'bg-blue-50 text-blue-600 border-blue-200' },
  sent:    { dot: 'bg-[#25D366]', label: 'Sent',      badge: 'bg-[#25D366]/8 text-[#1a9e4e] border-[#25D366]/20' },
  failed:  { dot: 'bg-red-400', label: 'Failed',    badge: 'bg-red-50 text-red-600 border-red-200' },
  cancelled: { dot: 'bg-gray-300', label: 'Cancelled', badge: 'bg-gray-50 text-gray-500 border-gray-200' },
};

interface ScheduledListProps {
  accountId: WhatsAppAccountId;
  onScheduleCreated?: number; // bump this to trigger a refetch
}

export function ScheduledList({ accountId, onScheduleCreated }: ScheduledListProps) {
  const { data: schedules = [], isLoading, refetch } = api.whatsapp.listScheduled.useQuery(
    { accountId },
    { refetchInterval: 30_000 },
  );

  const cancelMutation = api.whatsapp.cancelScheduled.useMutation({
    onSuccess: () => {
      void refetch();
      toast.success('Scheduled message cancelled');
    },
    onError: () => toast.error('Failed to cancel'),
  });

  // Refetch whenever a new schedule is created (bump from parent)
  const prevRef = { current: onScheduleCreated };
  if (prevRef.current !== onScheduleCreated) {
    void refetch();
    prevRef.current = onScheduleCreated;
  }

  const handleCancel = (id: string) => {
    if (!window.confirm('Cancel this scheduled message?')) return;
    cancelMutation.mutate({ id });
  };

  const pendingCount = schedules.filter((s) => s.status === 'pending').length;

  return (
    <div className="rounded-xl border border-[var(--color-border-subtle)] bg-white shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-[var(--color-border-subtle)] flex items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">Scheduled Messages</h2>
            {pendingCount > 0 && (
              <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-600 border border-blue-200">
                {pendingCount} pending
              </span>
            )}
          </div>
          <p className="text-xs text-[var(--color-text-muted)] mt-0.5">Messages queued to send at a specific time</p>
        </div>
        <button
          onClick={() => void refetch()}
          disabled={isLoading}
          className="p-1.5 rounded-lg text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)] transition disabled:opacity-40"
          title="Refresh"
        >
          <svg
            className={isLoading ? 'animate-spin' : ''}
            width="13" height="13" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
          >
            <path d="M23 4v6h-6" /><path d="M1 20v-6h6" />
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
          </svg>
        </button>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="px-5 py-8 flex items-center justify-center">
          <svg className="animate-spin text-[var(--color-text-muted)]" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
          </svg>
        </div>
      ) : schedules.length === 0 ? (
        <div className="px-5 py-10 flex flex-col items-center gap-2 text-center">
          <div className="w-10 h-10 rounded-full bg-[var(--color-bg-secondary)] flex items-center justify-center">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--color-text-faint)]">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
          </div>
          <p className="text-sm text-[var(--color-text-muted)]">No scheduled messages</p>
          <p className="text-xs text-[var(--color-text-faint)]">Use &quot;Schedule Send&quot; to queue a message for later</p>
        </div>
      ) : (
        <div className="divide-y divide-[var(--color-border-subtle)]">
          {schedules.map((schedule) => {
            const style = STATUS_STYLES[schedule.status];
            const preview = schedule.message.length > 70
              ? schedule.message.slice(0, 70) + '…'
              : schedule.message;
            const groupLabel = schedule.group_names.length <= 2
              ? schedule.group_names.join(', ')
              : `${schedule.group_names.slice(0, 2).join(', ')} +${schedule.group_names.length - 2} more`;

            return (
              <div key={schedule.id} className="px-5 py-3.5 flex items-start gap-3 hover:bg-[var(--color-bg-secondary)] transition-colors">
                {/* Status dot */}
                <div className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${style.dot}`} />

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-[var(--color-text-primary)] leading-snug">{preview}</p>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5">
                    <span className="text-xs text-[var(--color-text-muted)] truncate max-w-[200px]">{groupLabel}</span>
                    <span className="text-xs text-[var(--color-text-faint)]">·</span>
                    <span className="text-xs text-[var(--color-text-muted)]">
                      {formatSydneyTime(schedule.scheduled_at)}
                    </span>
                  </div>
                </div>

                {/* Right: badge + cancel */}
                <div className="shrink-0 flex items-center gap-2">
                  <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full border ${style.badge}`}>
                    {style.label}
                  </span>
                  {schedule.status === 'pending' && (
                    <button
                      onClick={() => handleCancel(schedule.id)}
                      disabled={cancelMutation.isPending}
                      title="Cancel scheduled message"
                      className="w-6 h-6 rounded-md flex items-center justify-center text-[var(--color-text-muted)] hover:text-red-500 hover:bg-red-50 transition disabled:opacity-40"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6l-1 14H6L5 6" />
                        <path d="M10 11v6" /><path d="M14 11v6" />
                        <path d="M9 6V4h6v2" />
                      </svg>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
