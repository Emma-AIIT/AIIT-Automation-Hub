/**
 * ScheduledList - the schedules still to come for one account.
 *
 * Shows only active rows: pending ones (switched on or off, including a repeating
 * series part-way through) and failed ones, which stay with their error until
 * deleted. Finished schedules leave this panel; their broadcasts appear in
 * Broadcast History with a "Scheduled" badge.
 *
 * Each row has an on/off switch (whatsapp.setScheduledEnabled; an off row is
 * skipped by the cron and shown as Paused), and pressing it opens ScheduleModal in
 * edit mode. Switching on a one-off whose time has passed opens the editor to pick
 * a new time instead.
 *
 * A "∞ Forever" series never finishes, so it stays here ("12 sent · next …")
 * until it is switched off or stopped with the bin button.
 */
'use client';

import { useEffect, useState } from 'react';
import { formatInTimeZone } from 'date-fns-tz';
import { api } from '@/trpc/react';
import toast from 'react-hot-toast';
import type { ScheduledMessage } from '@/server/api/routers/whatsapp';
import type { WhatsAppAccountId } from '@/lib/config/whatsapp-accounts';
import {
  SCHEDULE_TZ,
  describeRepeatStatus,
  formatRepeatDay,
  formatRepeatTime,
  totalPosts,
} from '@/lib/schedule-repeat';
import { ScheduleModal } from './ScheduleModal';

function formatSydneyTime(isoString: string): string {
  return formatInTimeZone(new Date(isoString), SCHEDULE_TZ, "EEE d MMM · h:mm a zzz");
}

function isRepeating(s: ScheduledMessage): boolean {
  if ((s.repeat_interval ?? 'none') === 'none') return false;
  return !!s.repeat_forever || totalPosts(s.repeat_total ?? 1, s.repeat_times) > 1;
}

/** Sends not yet made (a pending series includes the one at scheduled_at). */
function remainingSends(s: ScheduledMessage): number {
  return Math.max(0, totalPosts(s.repeat_total ?? 1, s.repeat_times) - (s.repeat_sent ?? 0));
}

/**
 * "Repeats weekly · 1 of 4 sent · next Mon 10 Nov 9:00 am" or, forever,
 * "Repeats daily at 9:00 am & 6:00 pm ∞ · 12 sent · next Tue 3 Nov 6:00 pm".
 * Paused rows already carry a Paused badge, so "paused" is left off here.
 */
function repeatLine(s: ScheduledMessage): string {
  return describeRepeatStatus(s)
    .filter((p) => p !== 'paused')
    .join(' · ');
}

/** iOS/Android-style switch: green on, grey off. The button itself is 44px tall. */
function Toggle({
  on,
  disabled,
  onChange,
  label,
}: {
  on: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      title={on ? 'On - press to pause' : 'Paused - press to switch on'}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className="min-w-[52px] min-h-[44px] flex items-center justify-center disabled:opacity-50"
    >
      <span
        className={`relative inline-block w-11 h-6 rounded-full transition-colors ${on ? 'bg-[#25D366]' : 'bg-gray-300'}`}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${on ? 'translate-x-5' : 'translate-x-0'}`}
        />
      </span>
    </button>
  );
}

interface ScheduledListProps {
  accountId: WhatsAppAccountId;
  onScheduleCreated?: number; // bump this to trigger a refetch
}

export function ScheduledList({ accountId, onScheduleCreated }: ScheduledListProps) {
  const { data: schedules = [], isLoading, refetch } = api.whatsapp.listScheduled.useQuery(
    { accountId },
    { refetchInterval: 30_000 },
  );
  const [editing, setEditing] = useState<{ schedule: ScheduledMessage; enableOnSave: boolean } | null>(null);

  const cancelMutation = api.whatsapp.cancelScheduled.useMutation({
    onSuccess: () => {
      void refetch();
      toast.success('Scheduled message cancelled');
    },
    onError: () => toast.error('Failed to cancel'),
  });

  const deleteMutation = api.whatsapp.deleteScheduled.useMutation({
    onSuccess: () => {
      void refetch();
      toast.success('Deleted');
    },
    onError: (err) => toast.error(err.message),
  });

  const enableMutation = api.whatsapp.setScheduledEnabled.useMutation({
    onError: (err) => toast.error(err.message),
  });

  // Refetch whenever a new schedule is created (bump from parent)
  useEffect(() => {
    if (onScheduleCreated !== undefined && onScheduleCreated > 0) void refetch();
  }, [onScheduleCreated, refetch]);

  const handleCancel = (schedule: ScheduledMessage) => {
    const remaining = remainingSends(schedule);
    const prompt = schedule.repeat_forever && isRepeating(schedule)
      ? 'Stop this schedule? It will not send again.'
      : isRepeating(schedule)
        ? `Cancel the remaining ${remaining} send${remaining !== 1 ? 's' : ''}?`
        : 'Cancel this scheduled message?';
    if (!window.confirm(prompt)) return;
    cancelMutation.mutate({ id: schedule.id });
  };

  const handleToggle = async (schedule: ScheduledMessage, enabled: boolean) => {
    try {
      const res = await enableMutation.mutateAsync({ id: schedule.id, enabled });
      if (res.needsNewTime) {
        toast('Pick a new time, this one has passed');
        setEditing({ schedule, enableOnSave: true });
        return;
      }
      if (enabled && res.scheduledAt && res.scheduledAt !== schedule.scheduled_at) {
        const next = new Date(res.scheduledAt);
        toast.success(`Back on, next send ${formatRepeatDay(next)} ${formatRepeatTime(next)}`);
      } else {
        toast.success(enabled ? 'Schedule switched on' : 'Schedule paused');
      }
      void refetch();
    } catch {
      /* toast shown by onError */
    }
  };

  const activeCount = schedules.filter((s) => s.status === 'pending' && s.enabled !== false).length;
  const pausedCount = schedules.filter((s) => s.status === 'pending' && s.enabled === false).length;

  return (
    <div className="rounded-xl border border-[var(--color-border-subtle)] bg-white shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-[var(--color-border-subtle)] flex items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">Scheduled Messages</h2>
            {activeCount > 0 && (
              <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-600 border border-blue-200">
                {activeCount} upcoming
              </span>
            )}
            {pausedCount > 0 && (
              <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded-full bg-gray-50 text-gray-500 border border-gray-200">
                {pausedCount} paused
              </span>
            )}
          </div>
          <p className="text-xs text-[var(--color-text-muted)] mt-0.5">Press a schedule to edit it. Finished ones move to Broadcast History.</p>
        </div>
        <button
          onClick={() => void refetch()}
          disabled={isLoading}
          className="w-11 h-11 rounded-lg flex items-center justify-center text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)] transition disabled:opacity-40"
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
          <p className="text-xs text-[var(--color-text-faint)]">Use &quot;Schedule&quot; next to Send to queue a message for later</p>
        </div>
      ) : (
        <div className="divide-y divide-[var(--color-border-subtle)]">
          {schedules.map((schedule) => {
            const failed = schedule.status === 'failed';
            const paused = !failed && schedule.enabled === false;
            const preview = schedule.message.length > 70
              ? schedule.message.slice(0, 70) + '…'
              : schedule.message;
            const groupLabel = schedule.group_names.length <= 2
              ? schedule.group_names.join(', ')
              : `${schedule.group_names.slice(0, 2).join(', ')} +${schedule.group_names.length - 2} more`;

            const body = (
              <>
                <p className={`text-sm leading-snug ${paused ? 'text-[var(--color-text-muted)]' : 'text-[var(--color-text-primary)]'}`}>
                  {preview}
                </p>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5">
                  <span className="text-xs text-[var(--color-text-muted)] truncate max-w-[200px]">{groupLabel}</span>
                  <span className="text-xs text-[var(--color-text-faint)]">·</span>
                  <span className="text-xs text-[var(--color-text-muted)]">{formatSydneyTime(schedule.scheduled_at)}</span>
                  {paused && (
                    <span className="text-[11px] font-medium px-2 py-0.5 rounded-full border bg-gray-50 text-gray-500 border-gray-200">Paused</span>
                  )}
                  {failed && (
                    <span className="text-[11px] font-medium px-2 py-0.5 rounded-full border bg-red-50 text-red-600 border-red-200">Failed</span>
                  )}
                </div>
                {isRepeating(schedule) && (
                  <p className="text-xs text-[var(--color-text-muted)] mt-1">{repeatLine(schedule)}</p>
                )}
                {failed && schedule.error && (
                  <p className="text-xs text-red-500 mt-1 break-words">{schedule.error}</p>
                )}
              </>
            );

            return (
              <div
                key={schedule.id}
                className={`pl-5 pr-2 py-2 flex items-center gap-2 transition-colors ${paused ? 'bg-[var(--color-bg-secondary)]/60' : 'hover:bg-[var(--color-bg-secondary)]'}`}
              >
                {failed ? (
                  <div className="flex-1 min-w-0 py-1.5">{body}</div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setEditing({ schedule, enableOnSave: false })}
                    title="Edit this schedule"
                    className={`flex-1 min-w-0 min-h-[44px] py-1.5 text-left rounded-md ${paused ? 'opacity-70' : ''}`}
                  >
                    {body}
                  </button>
                )}

                {/* Right: switch + delete */}
                <div className="shrink-0 flex items-center">
                  {!failed && (
                    <Toggle
                      on={!paused}
                      disabled={enableMutation.isPending}
                      onChange={(next) => void handleToggle(schedule, next)}
                      label={paused ? 'Switch this schedule on' : 'Pause this schedule'}
                    />
                  )}
                  <button
                    onClick={() => (failed ? deleteMutation.mutate({ id: schedule.id }) : handleCancel(schedule))}
                    disabled={cancelMutation.isPending || deleteMutation.isPending}
                    title={failed ? 'Delete this failed schedule' : 'Cancel scheduled message'}
                    aria-label={failed ? 'Delete' : 'Cancel schedule'}
                    className="w-11 h-11 rounded-md flex items-center justify-center text-[var(--color-text-muted)] hover:text-red-500 hover:bg-red-50 transition disabled:opacity-40"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6l-1 14H6L5 6" />
                      <path d="M10 11v6" /><path d="M14 11v6" />
                      <path d="M9 6V4h6v2" />
                    </svg>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {editing && (
        <ScheduleModal
          mode="edit"
          isOpen
          accountId={accountId}
          schedule={editing.schedule}
          enableOnSave={editing.enableOnSave}
          onClose={() => setEditing(null)}
          onSaved={() => void refetch()}
        />
      )}
    </div>
  );
}
