import { TZDate } from "@date-fns/tz";

/**
 * Clinic-local date helpers. Dates are plain "YYYY-MM-DD" strings, times are "HH:mm".
 * Timestamps are stored as UTC ISO strings; the clinic timezone (default Asia/Manila) is only
 * used to convert at the edges. Philippines has no DST, but we never hard-code +08:00.
 */
export const DEFAULT_TZ = "Asia/Manila";

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isDateString(value: string): boolean {
  const m = DATE_RE.exec(value);
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.toISOString().slice(0, 10) === value;
}

function utcDate(date: string): Date {
  const m = DATE_RE.exec(date);
  if (!m) throw new RangeError(`Invalid date: ${date}`);
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
}

export function addDays(date: string, days: number): string {
  const d = utcDate(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** First clinic-local calendar date of the month after `date`. */
export function firstDayOfNextMonth(date: string): string {
  const d = utcDate(date);
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + 1);
  return d.toISOString().slice(0, 10);
}

/** The next Monday-to-Friday day after `date` (payouts do not arrive on weekends). */
export function nextBusinessDay(date: string): string {
  let d = addDays(date, 1);
  while (weekdayOf(d) === 0 || weekdayOf(d) === 6) d = addDays(d, 1);
  return d;
}

/** The last `count` calendar months up to and including the month of `date`, oldest first ("YYYY-MM"). */
export function lastMonths(date: string, count: number): string[] {
  const y = Number(date.slice(0, 4));
  const m = Number(date.slice(5, 7)) - 1;
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(Date.UTC(y, m - (count - 1 - i), 1));
    return d.toISOString().slice(0, 7);
  });
}

/** 0 = Sunday ... 6 = Saturday (matches the database `weekday` column). */
export function weekdayOf(date: string): number {
  return utcDate(date).getUTCDay();
}

/** Monday of the week containing `date`. */
export function startOfWeek(date: string): string {
  const wd = weekdayOf(date);
  return addDays(date, wd === 0 ? -6 : 1 - wd);
}

export function todayIn(tz: string, now: Date = new Date()): string {
  const z = new TZDate(now, tz);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${z.getFullYear()}-${pad(z.getMonth() + 1)}-${pad(z.getDate())}`;
}

/** Convert clinic-local date + "HH:mm" to a UTC ISO timestamp. */
export function zonedToUtcIso(date: string, time: string, tz: string): string {
  const m = DATE_RE.exec(date);
  const t = /^(\d{2}):(\d{2})/.exec(time);
  if (!m || !t) throw new RangeError(`Invalid date/time: ${date} ${time}`);
  const z = new TZDate(
    Number(m[1]),
    Number(m[2]) - 1,
    Number(m[3]),
    Number(t[1]),
    Number(t[2]),
    0,
    tz,
  );
  return new Date(z.getTime()).toISOString();
}

/** UTC [start, end) of a clinic-local calendar day. */
export function dayBoundsUtc(date: string, tz: string): { start: string; end: string } {
  return {
    start: zonedToUtcIso(date, "00:00", tz),
    end: zonedToUtcIso(addDays(date, 1), "00:00", tz),
  };
}

/** Clinic-local date ("YYYY-MM-DD") of a UTC instant. */
export function dateOf(iso: string, tz: string): string {
  return todayIn(tz, new Date(iso));
}

/** Minutes since local midnight of a UTC instant. */
export function minutesOfDay(iso: string, tz: string): number {
  const z = new TZDate(new Date(iso), tz);
  return z.getHours() * 60 + z.getMinutes();
}

export function formatTime(iso: string, tz: string): string {
  return new Intl.DateTimeFormat("en-PH", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: tz,
  })
    .format(new Date(iso))
    .replace(/\s?(am|pm)/i, (_, p: string) => ` ${p.toUpperCase()}`);
}

export function formatDateLong(date: string): string {
  return new Intl.DateTimeFormat("en-PH", {
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(utcDate(date));
}

export function formatDateShort(date: string): string {
  return new Intl.DateTimeFormat("en-PH", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(utcDate(date));
}

export function formatWeekday(date: string): string {
  return new Intl.DateTimeFormat("en-PH", { weekday: "short", timeZone: "UTC" }).format(
    utcDate(date),
  );
}

export function formatWeekRange(start: string, endInclusive: string): string {
  const s = utcDate(start);
  const e = utcDate(endInclusive);
  const month = (d: Date) =>
    new Intl.DateTimeFormat("en-PH", { month: "long", timeZone: "UTC" }).format(d);
  return s.getUTCMonth() === e.getUTCMonth()
    ? `${s.getUTCDate()} to ${e.getUTCDate()} ${month(e)}`
    : `${s.getUTCDate()} ${month(s)} to ${e.getUTCDate()} ${month(e)}`;
}

/** "09:00:00" | "09:00" -> "09:00" */
export function hhmm(time: string): string {
  return time.slice(0, 5);
}

export function toMinutes(time: string): number {
  const [h = "0", m = "0"] = time.split(":");
  return Number(h) * 60 + Number(m);
}

export function fromMinutes(total: number): string {
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}
