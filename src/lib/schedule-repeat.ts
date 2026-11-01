/**
 * Repeat maths for scheduled broadcasts (scheduled_messages.repeat_*).
 *
 * Pure and dependency-light so both the ScheduleModal preview (client) and the
 * cron (server) use the same numbers. No DB, no server-only imports.
 *
 * Occurrence n of a series is the anchor's *Sydney wall-clock* time plus n days,
 * weeks or months - so 9:00 am stays 9:00 am across daylight saving changes.
 * Monthly clamps to the last day of shorter months (31 Jan -> 28/29 Feb), the
 * same rule as date-fns addMonths, always counted from the anchor so a series
 * that starts on the 31st returns to the 31st in long months.
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

/** Allowed "Number of times" for a repeating series (counts the first send). */
export const REPEAT_MIN = 2;
export const REPEAT_MAX = 52;
export const REPEAT_DEFAULT = 4;

function pad(n: number, width = 2): string {
  return String(n).padStart(width, "0");
}

function daysInMonth(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

/**
 * The send time of occurrence `index` (0 = the anchor itself).
 * `interval` "none" only has index 0.
 */
export function nextOccurrence(
  anchor: string | Date,
  interval: RepeatInterval,
  index: number,
): Date {
  const anchorDate = typeof anchor === "string" ? new Date(anchor) : anchor;
  if (index === 0 || interval === "none") return new Date(anchorDate.getTime());

  const wall = formatInTimeZone(anchorDate, SCHEDULE_TZ, "yyyy-MM-dd HH:mm:ss");
  const [datePart, timePart] = wall.split(" ") as [string, string];
  const [y, m, d] = datePart.split("-").map(Number) as [number, number, number];
  const monthIndex = m - 1;

  let year: number;
  let month: number;
  let day: number;

  if (interval === "monthly") {
    const total = monthIndex + index;
    year = y + Math.floor(total / 12);
    month = ((total % 12) + 12) % 12;
    day = Math.min(d, daysInMonth(year, month));
  } else {
    const step = interval === "weekly" ? 7 * index : index;
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
 * actual sends against repeat_total, so the number of posts stays the same.
 */
export function nextFutureOccurrence(
  anchor: string | Date,
  interval: RepeatInterval,
  fromIndex: number,
  now: Date = new Date(),
): { at: Date; index: number } {
  if (interval === "none") throw new Error("A one-off schedule has no next occurrence");
  let index = Math.max(1, fromIndex);
  let at = nextOccurrence(anchor, interval, index);
  while (at.getTime() <= now.getTime()) {
    index++;
    at = nextOccurrence(anchor, interval, index);
  }
  return { at, index };
}

/** "Mon 3 Nov" */
export function formatRepeatDay(at: Date): string {
  return formatInTimeZone(at, SCHEDULE_TZ, "EEE d MMM");
}

/** "9:00 am" */
export function formatRepeatTime(at: Date): string {
  return formatInTimeZone(at, SCHEDULE_TZ, "h:mm a").toLowerCase();
}

/** "Sends 4 times: Mon 3 Nov … last Mon 24 Nov, 9:00 am" */
export function describeSeries(anchor: string | Date, interval: RepeatInterval, total: number): string {
  const first = nextOccurrence(anchor, interval, 0);
  const last = nextOccurrence(anchor, interval, Math.max(0, total - 1));
  return `Sends ${total} times: ${formatRepeatDay(first)} … last ${formatRepeatDay(last)}, ${formatRepeatTime(first)}`;
}
