/**
 * Repeat maths for scheduled broadcasts (scheduled_messages.repeat_*).
 *
 * Pure and dependency-light so both the ScheduleModal preview (client) and the
 * cron (server) use the same numbers. No DB, no server-only imports.
 *
 * A series has one or more *slots* per period: `times` (repeat_times) is a sorted
 * list of Sydney wall-clock "HH:mm" values, e.g. ["09:00", "18:00"]. Null/empty
 * means one slot at the anchor's own time (the pre-"times" behaviour).
 *
 * Occurrence i (0 = repeat_anchor_at itself) counts *posts*. With n times and the
 * anchor sitting on slot k (its time's position in `times`), occurrence i is slot
 * j = k + i: period floor(j / n) days, weeks or months after the anchor's Sydney
 * date, at times[j % n]. Wall-clock arithmetic, so 9:00 am stays 9:00 am across
 * daylight saving changes. Monthly clamps to the last day of shorter months
 * (31 Jan -> 28/29 Feb), the same rule as date-fns addMonths, always counted from
 * the anchor so a series that starts on the 31st returns to the 31st.
 *
 * "Number of times" (repeat_total) counts *periods* (days, weeks, months), not
 * posts: a series makes repeat_total x n posts, or never finishes when forever.
 *
 * The arithmetic is done on plain calendar fields rather than with date-fns'
 * addDays/addMonths on a toZonedTime() Date, because those operate in the
 * *runtime's* local zone: on a machine set to Sydney they would shift a time
 * that falls in the skipped DST hour. Field arithmetic is the same everywhere.
 */
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";

export const SCHEDULE_TZ = "Australia/Sydney";

export const REPEAT_INTERVALS = ["none", "daily", "weekly", "monthly"] as const;
export type RepeatInterval = (typeof REPEAT_INTERVALS)[number];

/** Allowed "Number of times" for a repeating series (counts the first period). */
export const REPEAT_MIN = 2;
export const REPEAT_MAX = 52;
export const REPEAT_DEFAULT = 4;
/** Most send times per day / week / month in one schedule. */
export const REPEAT_TIMES_MAX = 4;

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

function pad(n: number, width = 2): string {
  return String(n).padStart(width, "0");
}

function daysInMonth(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

/** "HH:mm" of `at` in Sydney. */
export function sydneyTime(at: string | Date): string {
  return formatInTimeZone(typeof at === "string" ? new Date(at) : at, SCHEDULE_TZ, "HH:mm");
}

/** "yyyy-MM-dd" of `at` in Sydney. */
export function sydneyDate(at: string | Date): string {
  return formatInTimeZone(typeof at === "string" ? new Date(at) : at, SCHEDULE_TZ, "yyyy-MM-dd");
}

/** A Sydney wall-clock date ("yyyy-MM-dd") and time ("HH:mm") as a UTC Date. */
export function fromSydney(date: string, time: string): Date {
  return fromZonedTime(`${date}T${time}:00`, SCHEDULE_TZ);
}

/** Sorted, de-duplicated, valid "HH:mm" values. */
export function normaliseTimes(times: readonly string[]): string[] {
  return [...new Set(times.filter((t) => HHMM.test(t)))].sort();
}

/** Problem with a repeat_times list, or null when it is fine. */
export function validateTimes(times: readonly string[]): string | null {
  if (times.length === 0) return "Add at least one time";
  if (times.length > REPEAT_TIMES_MAX) return `At most ${REPEAT_TIMES_MAX} times`;
  if (times.some((t) => !HHMM.test(t))) return "Times must be HH:mm";
  for (let i = 1; i < times.length; i++) {
    if (times[i - 1]! >= times[i]!) return "Times must be sorted with no duplicates";
  }
  return null;
}

/** Number of posts per period (1 when the row has no repeat_times). */
export function slotsPerPeriod(times: readonly string[] | null | undefined): number {
  return times && times.length > 0 ? times.length : 1;
}

/**
 * The send time of occurrence `index` (0 = the anchor itself).
 * `interval` "none" only has index 0. `times` is repeat_times (null = one slot at
 * the anchor's time).
 */
export function nextOccurrence(
  anchor: string | Date,
  interval: RepeatInterval,
  index: number,
  times?: readonly string[] | null,
): Date {
  const anchorDate = typeof anchor === "string" ? new Date(anchor) : anchor;
  if (index === 0 || interval === "none") return new Date(anchorDate.getTime());

  const wall = formatInTimeZone(anchorDate, SCHEDULE_TZ, "yyyy-MM-dd HH:mm:ss");
  const [datePart, anchorTime] = wall.split(" ") as [string, string];
  const [y, m, d] = datePart.split("-").map(Number) as [number, number, number];
  const monthIndex = m - 1;

  // Slot arithmetic. Without times there is one slot at the anchor's time.
  let period = index;
  let timePart = anchorTime;
  if (times && times.length > 0) {
    const n = times.length;
    // The anchor normally sits on one of the times; if not (hand-edited row), on
    // the first, so the series still advances one slot per post.
    const k = Math.max(0, times.indexOf(anchorTime.slice(0, 5)));
    const j = k + index;
    period = Math.floor(j / n);
    timePart = `${times[j % n]}:00`;
  }

  let year: number;
  let month: number;
  let day: number;

  if (interval === "monthly") {
    const total = monthIndex + period;
    year = y + Math.floor(total / 12);
    month = ((total % 12) + 12) % 12;
    day = Math.min(d, daysInMonth(year, month));
  } else {
    const step = interval === "weekly" ? 7 * period : period;
    const shifted = new Date(Date.UTC(y, monthIndex, d + step));
    year = shifted.getUTCFullYear();
    month = shifted.getUTCMonth();
    day = shifted.getUTCDate();
  }

  return fromZonedTime(`${pad(year, 4)}-${pad(month + 1)}-${pad(day)}T${timePart}`, SCHEDULE_TZ);
}

/**
 * The first occurrence at or after `fromIndex` that is strictly after `now`.
 * Used by the cron to re-arm a series: if slots were missed while the cron was
 * down they are skipped (never fired back-to-back), and the caller keeps counting
 * actual sends against the total, so the number of posts stays the same.
 */
export function nextFutureOccurrence(
  anchor: string | Date,
  interval: RepeatInterval,
  fromIndex: number,
  now: Date = new Date(),
  times?: readonly string[] | null,
): { at: Date; index: number } {
  if (interval === "none") throw new Error("A one-off schedule has no next occurrence");
  let index = Math.max(1, fromIndex);
  let at = nextOccurrence(anchor, interval, index, times);
  while (at.getTime() <= now.getTime()) {
    index++;
    at = nextOccurrence(anchor, interval, index, times);
  }
  return { at, index };
}

/**
 * Which occurrence (counted from repeat_anchor_at) a series is on once `sent`
 * posts have gone. Editing a series re-anchors it at the new first send and sets
 * repeat_base_sent = repeat_sent, so sends made before the edit don't count
 * towards the new anchor. Rows from before v2 have base 0.
 */
export function occurrenceIndex(sent: number, baseSent: number | null | undefined): number {
  return Math.max(0, sent - (baseSent ?? 0));
}

/** Posts a finite series makes in total: repeat_total periods x slots per period. */
export function totalPosts(repeatTotal: number, times?: readonly string[] | null): number {
  return repeatTotal * slotsPerPeriod(times);
}

/**
 * Whether a series still has sends after `sent` posts. Forever never finishes;
 * a one-off finishes after its single send.
 */
export function hasMoreToCome(
  row: {
    repeat_interval: RepeatInterval | null;
    repeat_total: number | null;
    repeat_forever?: boolean | null;
    repeat_times?: readonly string[] | null;
  },
  sent: number,
): boolean {
  const interval = row.repeat_interval ?? "none";
  if (interval === "none") return false;
  if (row.repeat_forever) return true;
  return sent < totalPosts(row.repeat_total ?? 1, row.repeat_times);
}

/**
 * Smallest allowed "Number of times" (periods) for a series that has already
 * sent `sent` posts with `slots` posts per period: at least one more post must
 * remain.
 */
export function minRepeatTotal(sent: number, slots = 1): number {
  return Math.max(REPEAT_MIN, Math.floor(sent / Math.max(1, slots)) + 1);
}

/**
 * Where a schedule goes when it is switched back on.
 *  - Its time is still ahead: unchanged.
 *  - A repeat whose slot passed while it was off: the next future occurrence
 *    (missed slots are skipped, not sent late, like the cron).
 *  - A one-off whose time passed: "needs-new-time"; the person picks one.
 */
export function rearmOnEnable(
  row: {
    scheduled_at: string;
    repeat_interval: RepeatInterval | null;
    repeat_anchor_at: string | null;
    repeat_sent: number | null;
    repeat_base_sent: number | null;
    repeat_times?: readonly string[] | null;
  },
  now: Date = new Date(),
): { scheduledAt: string } | "needs-new-time" {
  if (new Date(row.scheduled_at).getTime() > now.getTime()) return { scheduledAt: row.scheduled_at };
  const interval = row.repeat_interval ?? "none";
  if (interval === "none") return "needs-new-time";
  const anchor = row.repeat_anchor_at ?? row.scheduled_at;
  const from = occurrenceIndex(row.repeat_sent ?? 0, row.repeat_base_sent);
  return { scheduledAt: nextFutureOccurrence(anchor, interval, from, now, row.repeat_times).at.toISOString() };
}

/**
 * The first send of a schedule picked as a Sydney date plus a list of times: the
 * earliest slot on that date that is still after `now`, or null when every time
 * on that date has passed. Lets an edit re-anchor part-way through the day.
 */
export function firstSlotOnDate(date: string, times: readonly string[], now: Date = new Date()): Date | null {
  for (const t of normaliseTimes(times)) {
    const at = fromSydney(date, t);
    if (at.getTime() > now.getTime()) return at;
  }
  return null;
}

/** A schedule chosen in the composer but not saved yet (ScheduleModal "set" mode). */
export type PendingSchedule = {
  /** ISO UTC */
  scheduledAt: string;
  repeatInterval: RepeatInterval;
  /** Periods (days/weeks/months), counting the first; 1 for a one-off. Ignored when forever. */
  repeatTotal: number;
  /** Repeats until switched off. */
  repeatForever?: boolean;
  /** Sydney "HH:mm" per period, sorted; null/omitted = just scheduledAt's time. */
  repeatTimes?: string[] | null;
};

/** "9:00 am" from "09:00" */
export function formatHHMM(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number) as [number, number];
  const suffix = h < 12 ? "am" : "pm";
  return `${h % 12 === 0 ? 12 : h % 12}:${pad(m)} ${suffix}`;
}

/** "9:00 am & 6:00 pm" (falls back to `at`'s own time when there are no times). */
export function formatTimesList(times: readonly string[] | null | undefined, at?: Date): string {
  if (times && times.length > 0) return times.map(formatHHMM).join(" & ");
  return at ? formatRepeatTime(at) : "";
}

/**
 * "Tue 3 Nov 9:40 am", "Tue 3 Nov 9:40 am, daily ×2" or
 * "Tue 3 Nov 9:00 am & 6:00 pm, daily ∞"
 */
export function describePending(s: PendingSchedule): string {
  const at = new Date(s.scheduledAt);
  const repeating = s.repeatInterval !== "none";
  const times = repeating && s.repeatTimes && s.repeatTimes.length > 1 ? s.repeatTimes : null;
  const when = `${formatRepeatDay(at)} ${times ? formatTimesList(times) : formatRepeatTime(at)}`;
  if (!repeating) return when;
  return `${when}, ${s.repeatInterval} ${s.repeatForever ? "∞" : `×${s.repeatTotal}`}`;
}

/** "Mon 3 Nov" */
export function formatRepeatDay(at: Date): string {
  return formatInTimeZone(at, SCHEDULE_TZ, "EEE d MMM");
}

/** "9:00 am" */
export function formatRepeatTime(at: Date): string {
  return formatInTimeZone(at, SCHEDULE_TZ, "h:mm a").toLowerCase();
}

/**
 * The parts of a series' status line, for Scheduled Messages and Broadcast
 * History: ["Repeats daily at 9:00 am & 6:00 pm", "12 sent", "next Tue 6:00 pm"].
 *  - forever: "N sent" with no "of", never finishes
 *  - finite:  "N of M sent" where M = repeat_total x times (posts)
 * "next …" only while pending and switched on; "paused" when off.
 */
export function describeRepeatStatus(s: {
  repeat_interval: RepeatInterval | null;
  repeat_total: number | null;
  repeat_sent: number | null;
  repeat_forever?: boolean | null;
  repeat_times?: readonly string[] | null;
  scheduled_at: string;
  status: string;
  enabled?: boolean | null;
}): string[] {
  const times = s.repeat_times && s.repeat_times.length > 1 ? s.repeat_times : null;
  const sent = s.repeat_sent ?? 0;
  const parts = [
    `Repeats ${s.repeat_interval ?? "none"}${times ? ` at ${formatTimesList(times)}` : ""}${s.repeat_forever ? " ∞" : ""}`,
    s.repeat_forever ? `${sent} sent` : `${sent} of ${totalPosts(s.repeat_total ?? 1, times)} sent`,
  ];
  if (s.status === "pending") {
    const next = new Date(s.scheduled_at);
    parts.push(s.enabled === false ? "paused" : `next ${formatRepeatDay(next)} ${formatRepeatTime(next)}`);
  } else if (s.status === "cancelled") {
    parts.push(s.repeat_forever ? "stopped" : "cancelled");
  }
  return parts;
}

const EVERY: Record<Exclude<RepeatInterval, "none">, string> = {
  daily: "every day",
  weekly: "every week",
  monthly: "every month",
};

/**
 * The preview line under the Schedule window's repeat fields.
 *  - finite, one time:  "Sends 4 times: Mon 3 Nov … last Mon 24 Nov, 9:00 am"
 *  - finite, 2+ times:  "8 posts: Mon 3 Nov … last Thu 6 Nov at 9:00 am & 6:00 pm"
 *  - forever:           "Sends every day at 9:00 am & 6:00 pm until you switch it off"
 */
export function describeSeries(
  anchor: string | Date,
  interval: RepeatInterval,
  total: number,
  /** `posts` overrides total x times, e.g. the posts still to come on an edited series. */
  opts: { forever?: boolean; times?: readonly string[] | null; posts?: number } = {},
): string {
  const times = opts.times && opts.times.length > 0 ? opts.times : null;
  const first = nextOccurrence(anchor, interval, 0, times);
  if (opts.forever && interval !== "none") {
    return `Sends ${EVERY[interval]} at ${formatTimesList(times, first)} until you switch it off`;
  }
  const posts = Math.max(1, opts.posts ?? totalPosts(total, times));
  const last = nextOccurrence(anchor, interval, posts - 1, times);
  if (times && times.length > 1) {
    return `${posts} posts: ${formatRepeatDay(first)} … last ${formatRepeatDay(last)} at ${formatTimesList(times)}`;
  }
  return `Sends ${posts} times: ${formatRepeatDay(first)} … last ${formatRepeatDay(last)}, ${formatRepeatTime(first)}`;
}
