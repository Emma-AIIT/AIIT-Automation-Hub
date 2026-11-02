/**
 * ScheduleModal - picks when (and how often) a broadcast goes out. Two modes:
 *
 *  - "set": opened from the composer's Schedule button. Confirming ("Set schedule")
 *    saves nothing; it hands { scheduledAt, repeatInterval, repeatTotal } back via
 *    onSet, and the composer's send button turns into a blue "Schedule" button that
 *    creates the row. This is what stops a schedule and an accidental "Send now"
 *    going out side by side.
 *  - "edit": opened by pressing a row in ScheduledList. Every field is filled in,
 *    message and groups are editable too, and "Save changes" calls
 *    whatsapp.updateScheduled. "Number of times" can't go below the periods already
 *    done + 1.
 *
 * A repeating schedule can send at up to REPEAT_TIMES_MAX times per day/week/
 * month ("+ Add time") and can repeat "∞ Forever". "Number of times" counts
 * periods, not posts: daily x4 at 9 am and 6 pm = 8 posts.
 *
 * All times are Sydney wall-clock. Schedules carry no attachments (by design).
 */
'use client';

import { useState, useEffect, useMemo } from 'react';
import { formatInTimeZone } from 'date-fns-tz';
import { api } from '@/trpc/react';
import toast from 'react-hot-toast';
import type { WhatsAppAccountId } from '@/lib/config/whatsapp-accounts';
import type { ScheduledMessage } from '@/server/api/routers/whatsapp';
import {
  REPEAT_DEFAULT,
  REPEAT_MAX,
  REPEAT_TIMES_MAX,
  SCHEDULE_TZ,
  describeSeries,
  firstSlotOnDate,
  minRepeatTotal,
  normaliseTimes,
  sydneyTime,
  totalPosts,
  type PendingSchedule,
  type RepeatInterval,
} from '@/lib/schedule-repeat';

const MAX_CHARS = 1000;

const REPEAT_OPTIONS: { value: RepeatInterval; label: string }[] = [
  { value: 'none', label: 'Does not repeat' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
];

const INPUT_CLASS =
  'w-full min-h-[44px] rounded-lg border border-[var(--color-border-default)] bg-white px-3 py-2.5 text-sm text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-accent-primary)] focus:ring-2 focus:ring-[var(--color-accent-primary)]/10 transition';

function clampTimes(n: number, min: number): number {
  if (!Number.isFinite(n)) return Math.max(min, REPEAT_DEFAULT);
  return Math.min(REPEAT_MAX, Math.max(min, Math.round(n)));
}

function getSydneyToday(): string {
  return formatInTimeZone(new Date(), SCHEDULE_TZ, 'yyyy-MM-dd');
}

/** A sensible next time for "+ Add time": 18:00, else an hour after the last, not already used. */
function suggestNextTime(existing: string[]): string {
  const used = new Set(existing);
  if (!used.has('18:00') && existing.every((t) => t < '18:00')) return '18:00';
  const last = [...existing].sort().at(-1) ?? '09:00';
  const [h, m] = last.split(':').map(Number) as [number, number];
  for (let step = 1; step < 24; step++) {
    const candidate = `${String((h + step) % 24).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    if (!used.has(candidate)) return candidate;
  }
  return '12:00';
}

type SetModeProps = {
  mode: 'set';
  isOpen: boolean;
  onClose: () => void;
  /** Composer draft, shown as a summary. */
  message: string;
  groupCount: number;
  /** The schedule already chosen, when the chip is pressed to change it. */
  initial?: PendingSchedule | null;
  onSet: (schedule: PendingSchedule) => void;
};

type EditModeProps = {
  mode: 'edit';
  isOpen: boolean;
  onClose: () => void;
  accountId: WhatsAppAccountId;
  schedule: ScheduledMessage;
  /** Opened by switching a passed one-off back on: saving also switches it on. */
  enableOnSave?: boolean;
  onSaved: () => void;
};

export type ScheduleModalProps = SetModeProps | EditModeProps;

export function ScheduleModal(props: ScheduleModalProps) {
  const { isOpen, onClose, mode } = props;
  const editing = mode === 'edit' ? props.schedule : null;
  const alreadySent = editing?.repeat_sent ?? 0;

  const [date, setDate] = useState('');
  // Send times (Sydney "HH:mm"). Only the first is used when it doesn't repeat.
  // Kept as typed; sorted and de-duplicated on blur and when used.
  const [slotTimes, setSlotTimes] = useState<string[]>(['09:00']);
  const [forever, setForever] = useState(false);
  const [repeat, setRepeat] = useState<RepeatInterval>('none');
  // Kept as text so the field can be cleared while typing; clamped on use.
  const [timesText, setTimesText] = useState(String(REPEAT_DEFAULT));
  const [editMessage, setEditMessage] = useState('');
  const [editGroupIds, setEditGroupIds] = useState<Set<string>>(new Set());
  const [groupSearch, setGroupSearch] = useState('');
  const today = getSydneyToday();

  const initialSet = mode === 'set' ? props.initial : null;

  // Fill the fields each time the modal opens.
  useEffect(() => {
    if (!isOpen) return;
    const source: PendingSchedule | null | undefined = editing
      ? {
          scheduledAt: editing.scheduled_at,
          repeatInterval: editing.repeat_interval ?? 'none',
          repeatTotal: editing.repeat_total ?? 1,
          repeatForever: editing.repeat_forever ?? false,
          repeatTimes: editing.repeat_times ?? null,
        }
      : initialSet;
    if (source) {
      const at = new Date(source.scheduledAt);
      // A passed time (re-enabling a one-off) starts from today rather than the past.
      const passed = at.getTime() <= Date.now();
      setDate(passed ? today : formatInTimeZone(at, SCHEDULE_TZ, 'yyyy-MM-dd'));
      const savedTimes = source.repeatTimes && source.repeatTimes.length > 0 ? source.repeatTimes : null;
      setSlotTimes(savedTimes ? [...savedTimes] : [sydneyTime(at)]);
      setRepeat(source.repeatInterval);
      setForever(source.repeatInterval !== 'none' && (source.repeatForever ?? false));
      const min = minRepeatTotal(alreadySent, savedTimes?.length ?? 1);
      setTimesText(
        String(source.repeatInterval === 'none' ? Math.max(min, REPEAT_DEFAULT) : Math.max(min, source.repeatTotal)),
      );
    } else {
      setDate(today);
      setSlotTimes(['09:00']);
      setRepeat('none');
      setForever(false);
      setTimesText(String(REPEAT_DEFAULT));
    }
    if (editing) {
      setEditMessage(editing.message);
      setEditGroupIds(new Set(editing.group_ids));
      setGroupSearch('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refill only on open / a different row
  }, [isOpen, editing?.id]);

  // Edit mode: the account's synced groups, plus any of the schedule's groups no
  // longer in that list (so they can still be seen and unticked).
  const { data: syncedGroups = [] } = api.whatsapp.getGroups.useQuery(
    { accountId: mode === 'edit' ? props.accountId : 'aiit-automation' },
    { enabled: isOpen && mode === 'edit', staleTime: 5 * 60 * 1000 },
  );
  const groupOptions = useMemo(() => {
    if (!editing) return [];
    const known = new Map(syncedGroups.map((g) => [g.id, g.name]));
    editing.group_ids.forEach((id, i) => {
      if (!known.has(id)) known.set(id, editing.group_names[i] ?? id);
    });
    return [...known.entries()].map(([id, name]) => ({ id, name }));
  }, [editing, syncedGroups]);
  const filteredGroups = useMemo(() => {
    const q = groupSearch.trim().toLowerCase();
    const list = q ? groupOptions.filter((g) => g.name.toLowerCase().includes(q)) : groupOptions;
    // Ticked groups first, then by name.
    return [...list].sort((a, b) => {
      const at = editGroupIds.has(a.id) ? 0 : 1;
      const bt = editGroupIds.has(b.id) ? 0 : 1;
      return at - bt || a.name.localeCompare(b.name);
    });
  }, [groupOptions, groupSearch, editGroupIds]);

  // The times actually used: one for a one-off, the sorted unique list otherwise.
  const effectiveTimes =
    repeat === 'none' ? normaliseTimes(slotTimes.slice(0, 1)) : normaliseTimes(slotTimes);
  const minTimes = minRepeatTotal(alreadySent, effectiveTimes.length || 1);
  const times = repeat === 'none' ? 1 : clampTimes(Number(timesText), minTimes);
  const isForever = repeat !== 'none' && forever;

  // First send: the earliest of the times on the chosen date that is still ahead
  // (so an edit made part-way through the day starts from the next slot).
  const firstSend = date && effectiveTimes.length > 0 ? firstSlotOnDate(date, effectiveTimes) : null;

  // Live preview of the remaining series; null until the date/time parse.
  let seriesPreview: string | null = null;
  if (repeat !== 'none' && firstSend) {
    seriesPreview = describeSeries(firstSend, repeat, times, {
      forever: isForever,
      times: effectiveTimes,
      posts: totalPosts(times, effectiveTimes) - alreadySent,
    });
  }

  const utils = api.useUtils();
  const updateMutation = api.whatsapp.updateScheduled.useMutation();

  const handleConfirm = async () => {
    if (!date || effectiveTimes.length === 0) {
      toast.error('Please select a date and time');
      return;
    }
    if (!firstSend) {
      toast.error('Scheduled time must be in the future');
      return;
    }
    const scheduledAt = firstSend.toISOString();
    // A single time is stored as null (the anchor's own time).
    const repeatTimes = repeat !== 'none' && effectiveTimes.length > 1 ? effectiveTimes : null;

    if (props.mode === 'set') {
      props.onSet({
        scheduledAt,
        repeatInterval: repeat,
        repeatTotal: times,
        repeatForever: isForever,
        repeatTimes,
      });
      onClose();
      return;
    }

    const message = editMessage.trim();
    if (!message) {
      toast.error('The message cannot be empty');
      return;
    }
    const ids = groupOptions.filter((g) => editGroupIds.has(g.id));
    if (ids.length === 0) {
      toast.error('Pick at least one group');
      return;
    }
    try {
      await updateMutation.mutateAsync({
        id: props.schedule.id,
        message,
        groupIds: ids.map((g) => g.id),
        groupNames: ids.map((g) => g.name),
        scheduledAt,
        repeatInterval: repeat,
        repeatTotal: times,
        repeatForever: isForever,
        repeatTimes: repeatTimes ?? undefined,
        enable: props.enableOnSave ?? false,
      });
      toast.success('Schedule updated');
      void utils.whatsapp.listScheduled.invalidate();
      props.onSaved();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save the schedule');
    }
  };

  if (!isOpen) return null;

  const toggleGroup = (id: string) =>
    setEditGroupIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const summaryMessage = mode === 'set' ? props.message : '';
  const previewText = summaryMessage.length > 80 ? summaryMessage.slice(0, 80) + '…' : summaryMessage;
  const groupCount = mode === 'set' ? props.groupCount : editGroupIds.size;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/30 z-40 backdrop-blur-[1px]" onClick={onClose} />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl border border-[var(--color-border-subtle)] w-full max-w-md max-h-[calc(100dvh-2rem)] flex flex-col">

          {/* Header */}
          <div className="px-6 py-5 border-b border-[var(--color-border-subtle)] shrink-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-[var(--color-accent-primary)]/10 flex items-center justify-center">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent-primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                    <line x1="16" y1="2" x2="16" y2="6" />
                    <line x1="8" y1="2" x2="8" y2="6" />
                    <line x1="3" y1="10" x2="21" y2="10" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">
                    {mode === 'edit' ? 'Edit schedule' : 'Schedule Message'}
                  </h2>
                  <p className="text-xs text-[var(--color-text-muted)]">All times in Sydney (AEDT/AEST)</p>
                </div>
              </div>
              <button
                onClick={onClose}
                aria-label="Close"
                className="w-11 h-11 -mr-2 rounded-full flex items-center justify-center text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)] transition"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          </div>

          <div className="px-6 py-5 space-y-4 overflow-y-auto">
            {mode === 'set' ? (
              /* Summary of the composer draft */
              <div className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-bg-secondary)] px-4 py-3 space-y-1.5">
                <span className="text-xs text-[var(--color-text-muted)]">
                  {groupCount} group{groupCount !== 1 ? 's' : ''} selected
                </span>
                {summaryMessage && (
                  <p className="text-xs text-[var(--color-text-muted)] italic leading-relaxed">&ldquo;{previewText}&rdquo;</p>
                )}
              </div>
            ) : (
              <>
                {/* Message */}
                <div className="space-y-1.5">
                  <label htmlFor="schedule-message" className="text-xs font-medium text-[var(--color-text-secondary)]">Message</label>
                  <textarea
                    id="schedule-message"
                    value={editMessage}
                    onChange={(e) => setEditMessage(e.target.value.slice(0, MAX_CHARS))}
                    rows={4}
                    className={`${INPUT_CLASS} resize-none leading-relaxed`}
                  />
                </div>

                {/* Groups */}
                <div className="space-y-1.5">
                  <div className="flex items-baseline justify-between">
                    <label htmlFor="schedule-group-search" className="text-xs font-medium text-[var(--color-text-secondary)]">Groups</label>
                    <span className="text-xs text-[var(--color-text-muted)]">{editGroupIds.size} selected</span>
                  </div>
                  <input
                    id="schedule-group-search"
                    type="search"
                    value={groupSearch}
                    onChange={(e) => setGroupSearch(e.target.value)}
                    placeholder="Search groups"
                    className={INPUT_CLASS}
                  />
                  <ul className="max-h-48 overflow-y-auto rounded-lg border border-[var(--color-border-subtle)] divide-y divide-[var(--color-border-subtle)]">
                    {filteredGroups.length === 0 ? (
                      <li className="px-3 py-3 text-xs text-[var(--color-text-faint)]">No groups match</li>
                    ) : (
                      filteredGroups.map((g) => (
                        <li key={g.id}>
                          <label className="flex items-center gap-3 px-3 min-h-[44px] cursor-pointer hover:bg-[var(--color-bg-hover)]">
                            <input
                              type="checkbox"
                              checked={editGroupIds.has(g.id)}
                              onChange={() => toggleGroup(g.id)}
                              className="w-4 h-4 accent-[var(--color-accent-primary)]"
                            />
                            <span className="text-sm text-[var(--color-text-primary)] truncate">{g.name}</span>
                          </label>
                        </li>
                      ))
                    )}
                  </ul>
                </div>
              </>
            )}

            {/* Date */}
            <div className="space-y-1.5">
              <label htmlFor="schedule-date" className="text-xs font-medium text-[var(--color-text-secondary)]">Date</label>
              <input
                id="schedule-date"
                type="date"
                value={date}
                min={today}
                onChange={(e) => setDate(e.target.value)}
                className={INPUT_CLASS}
              />
            </div>

            {/* Times: one for a one-off; up to REPEAT_TIMES_MAX per period when repeating */}
            <div className="space-y-1.5">
              <label htmlFor="schedule-time-0" className="text-xs font-medium text-[var(--color-text-secondary)]">
                {repeat !== 'none' && slotTimes.length > 1 ? 'Times' : 'Time'}{' '}
                <span className="text-[var(--color-text-faint)] font-normal">(Sydney)</span>
              </label>
              <div className="flex flex-wrap items-center gap-2">
                {(repeat === 'none' ? slotTimes.slice(0, 1) : slotTimes).map((t, i) => (
                  <div key={i} className={`flex items-center gap-1 ${i === 0 && (repeat === 'none' || slotTimes.length === 1) ? 'w-full' : ''}`}>
                    <input
                      id={`schedule-time-${i}`}
                      type="time"
                      value={t}
                      aria-label={`Send time ${i + 1}`}
                      onChange={(e) =>
                        setSlotTimes((prev) => prev.map((v, j) => (j === i ? e.target.value : v)))
                      }
                      onBlur={() => setSlotTimes((prev) => (prev.length > 1 ? normaliseTimes(prev) : prev))}
                      className={`${INPUT_CLASS} ${i === 0 && (repeat === 'none' || slotTimes.length === 1) ? '' : 'w-[8.5rem]'}`}
                    />
                    {i > 0 && repeat !== 'none' && (
                      <button
                        type="button"
                        onClick={() => setSlotTimes((prev) => prev.filter((_, j) => j !== i))}
                        aria-label={`Remove ${t}`}
                        className="w-11 h-11 rounded-full flex items-center justify-center text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)] transition"
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                      </button>
                    )}
                  </div>
                ))}
                {repeat !== 'none' && slotTimes.length < REPEAT_TIMES_MAX && (
                  <button
                    type="button"
                    onClick={() => setSlotTimes((prev) => normaliseTimes([...prev, suggestNextTime(prev)]))}
                    className="min-h-[44px] px-3 rounded-lg text-sm font-medium text-[var(--color-accent-primary)] hover:bg-[var(--color-accent-primary)]/10 transition"
                  >
                    + Add time
                  </button>
                )}
              </div>
            </div>

            {/* Repeat */}
            <div className="flex gap-3">
              <div className="space-y-1.5 flex-1">
                <label htmlFor="schedule-repeat" className="text-xs font-medium text-[var(--color-text-secondary)]">Repeat</label>
                <select
                  id="schedule-repeat"
                  value={repeat}
                  onChange={(e) => setRepeat(e.target.value as RepeatInterval)}
                  className={INPUT_CLASS}
                >
                  {REPEAT_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              {repeat !== 'none' && (
                <div className="space-y-1.5 w-32">
                  <label htmlFor="schedule-times" className="text-xs font-medium text-[var(--color-text-secondary)]">Number of times</label>
                  <input
                    id="schedule-times"
                    type="number"
                    inputMode="numeric"
                    min={minTimes}
                    max={REPEAT_MAX}
                    step={1}
                    value={isForever ? '' : timesText}
                    placeholder={isForever ? '∞' : undefined}
                    disabled={isForever}
                    onChange={(e) => setTimesText(e.target.value)}
                    onBlur={() => setTimesText(String(clampTimes(Number(timesText), minTimes)))}
                    className={`${INPUT_CLASS} disabled:bg-[var(--color-bg-secondary)] disabled:text-[var(--color-text-faint)]`}
                  />
                </div>
              )}
            </div>
            {repeat !== 'none' && (
              <label className="flex items-center gap-2.5 min-h-[44px] -mt-2 cursor-pointer w-fit">
                <input
                  type="checkbox"
                  checked={forever}
                  onChange={(e) => setForever(e.target.checked)}
                  className="w-4 h-4 accent-[var(--color-accent-primary)]"
                />
                <span className="text-sm text-[var(--color-text-primary)]">∞ Forever</span>
                <span className="text-xs text-[var(--color-text-muted)]">until you switch it off</span>
              </label>
            )}
            {repeat !== 'none' && effectiveTimes.length > 1 && !isForever && (
              <p className="text-xs text-[var(--color-text-muted)] -mt-1">
                Number of times counts {repeat === 'daily' ? 'days' : repeat === 'weekly' ? 'weeks' : 'months'}, not posts.
              </p>
            )}
            {alreadySent > 0 && (
              <p className="text-xs text-[var(--color-text-muted)] -mt-1">
                {alreadySent} already sent{repeat !== 'none' && !isForever ? ', counted in Number of times' : ''}.
              </p>
            )}
            {seriesPreview && (
              <p className="text-xs text-[var(--color-text-muted)] -mt-1">{seriesPreview}</p>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 pb-5 pt-1 flex items-center gap-3 shrink-0">
            <button
              onClick={onClose}
              className="flex-1 min-h-[44px] rounded-lg border border-[var(--color-border-default)] text-sm font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)] transition"
            >
              Cancel
            </button>
            <button
              onClick={() => void handleConfirm()}
              disabled={updateMutation.isPending || !date || effectiveTimes.length === 0}
              className="flex-1 min-h-[44px] flex items-center justify-center gap-2 rounded-lg bg-[#3b82f6] hover:bg-[#2563eb] disabled:opacity-50 disabled:cursor-not-allowed text-sm font-semibold text-white transition"
            >
              {updateMutation.isPending ? 'Saving…' : mode === 'edit' ? 'Save changes' : 'Set schedule'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
