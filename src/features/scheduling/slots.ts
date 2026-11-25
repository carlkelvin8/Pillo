import { addDays, fromMinutes, toMinutes, weekdayOf, zonedToUtcIso } from "@/lib/datetime";

export type HourWindow = { weekday: number; start: string; end: string };
export type BusyRange = { startsAt: string; endsAt: string };

export const DEFAULT_DURATION_MIN = 30;
export const DEFAULT_STEP_MIN = 30;

type SlotInput = {
  /** Clinic-local date, "YYYY-MM-DD". */
  date: string;
  tz: string;
  durationMin?: number;
  stepMin?: number;
  /** Branch opening windows (all weekdays; filtered here). */
  branchHours: HourWindow[];
  /**
   * This doctor's windows at this branch. Empty = available whenever the branch is open.
   * Non-empty = ONLY these windows, intersected with branch hours (no row for a weekday = off that day).
   */
  doctorHours: HourWindow[];
  /** Existing active appointments for this doctor. */
  booked: BusyRange[];
  /** Slots that start at or before this instant are dropped. */
  now?: Date;
};

type Interval = [number, number];

function intersect(a: Interval[], b: Interval[]): Interval[] {
  const out: Interval[] = [];
  for (const [as, ae] of a) {
    for (const [bs, be] of b) {
      const s = Math.max(as, bs);
      const e = Math.min(ae, be);
      if (e > s) out.push([s, e]);
    }
  }
  return out;
}

const windowsFor = (hours: HourWindow[], weekday: number): Interval[] =>
  hours
    .filter((h) => h.weekday === weekday)
    .map((h): Interval => [toMinutes(h.start), toMinutes(h.end)]);

/** Open start times (UTC ISO) for one doctor on one clinic-local day. */
export function generateSlots(input: SlotInput): string[] {
  const { date, tz, branchHours, doctorHours, booked } = input;
  const duration = input.durationMin ?? DEFAULT_DURATION_MIN;
  const step = input.stepMin ?? DEFAULT_STEP_MIN;
  const nowMs = input.now?.getTime() ?? Number.NEGATIVE_INFINITY;
  if (duration <= 0 || step <= 0) return [];

  const weekday = weekdayOf(date);
  let windows = windowsFor(branchHours, weekday);
  if (doctorHours.length > 0) windows = intersect(windows, windowsFor(doctorHours, weekday));

  const busy = booked.map(
    (b) => [new Date(b.startsAt).getTime(), new Date(b.endsAt).getTime()] as const,
  );
  const slots: string[] = [];
  for (const [open, close] of windows) {
    for (let start = open; start + duration <= close; start += step) {
      const startIso = zonedToUtcIso(date, fromMinutes(start), tz);
      const startMs = new Date(startIso).getTime();
      const endMs = startMs + duration * 60_000;
      if (startMs <= nowMs) continue;
      if (busy.some(([bs, be]) => startMs < be && endMs > bs)) continue;
      slots.push(startIso);
    }
  }
  return [...new Set(slots)].sort();
}

/** Is this exact start a currently open slot? Used server-side before booking. */
export function isOpenSlot(input: SlotInput, startIso: string): boolean {
  return generateSlots(input).includes(new Date(startIso).toISOString());
}

/** Next `count` dates (from `from`) on which the branch is open at all. */
export function upcomingOpenDates(
  from: string,
  branchHours: HourWindow[],
  count: number,
  horizonDays = 60,
): string[] {
  const days: string[] = [];
  for (let i = 0; i < horizonDays && days.length < count; i++) {
    const d = addDays(from, i);
    if (branchHours.some((h) => h.weekday === weekdayOf(d))) days.push(d);
  }
  return days;
}

/** Is the doctor working at this branch on this clinic-local day at all? (Used for the Available / Off today chip.) */
export function doctorWorksOn(
  date: string,
  branchHours: HourWindow[],
  doctorHours: HourWindow[],
): boolean {
  const weekday = weekdayOf(date);
  const open = windowsFor(branchHours, weekday);
  if (open.length === 0) return false;
  if (doctorHours.length === 0) return true;
  return intersect(open, windowsFor(doctorHours, weekday)).length > 0;
}
