import { dateOf, minutesOfDay, toMinutes } from "@/lib/datetime";

const BOOKED_HOUR_PX = 64;
const EMPTY_HOUR_PX = 40;
const BLOCK_MIN_PX = 24;
const BLOCK_INSET_PX = 2;
export const HEADER_PX = 44;

type AppointmentTimes = { startsAt: string; endsAt: string };
type CalendarRow = { hour: number; top: number; height: number };
type CalendarGrid = { startHour: number; rows: CalendarRow[]; height: number };

function appointmentMinutes({ startsAt, endsAt }: AppointmentTimes, tz: string) {
  const start = minutesOfDay(startsAt, tz);
  // Appointments are rendered in their starting-day column.
  const end = dateOf(startsAt, tz) === dateOf(endsAt, tz) ? minutesOfDay(endsAt, tz) : 24 * 60;
  return { start, end: Math.max(end, start + 1) };
}

/** Build a shared time axis covering the displayed opening hours and appointments. */
export function calendarGrid(
  openWindows: { start: string; end: string }[],
  appointments: AppointmentTimes[],
  tz: string,
): CalendarGrid {
  const bookings = appointments.map((appointment) => appointmentMinutes(appointment, tz));
  const ranges = [
    ...openWindows.map(({ start, end }) => ({ start: toMinutes(start), end: toMinutes(end) })),
    ...bookings,
  ];
  const startHour = ranges.length ? Math.floor(Math.min(...ranges.map((r) => r.start)) / 60) : 8;
  const endHour = ranges.length ? Math.ceil(Math.max(...ranges.map((r) => r.end)) / 60) : 18;
  const rows: CalendarRow[] = [];
  let height = 0;
  for (let hour = startHour; hour < endHour; hour++) {
    const booked = bookings.some(({ start, end }) => start < (hour + 1) * 60 && end > hour * 60);
    const rowHeight = booked ? BOOKED_HOUR_PX : EMPTY_HOUR_PX;
    rows.push({ hour, top: height, height: rowHeight });
    height += rowHeight;
  }
  // Leave space for a short appointment at the bottom without shifting its start time.
  const grid = { startHour, rows, height };
  for (const { start } of bookings) {
    grid.height = Math.max(
      grid.height,
      minutePosition(start, grid) + BLOCK_MIN_PX + BLOCK_INSET_PX * 2,
    );
  }
  return grid;
}

function minutePosition(minutes: number, grid: CalendarGrid) {
  const row = grid.rows[Math.floor(minutes / 60) - grid.startHour];
  if (row) return row.top + ((minutes % 60) / 60) * row.height;
  const lastRow = grid.rows.at(-1);
  return lastRow ? lastRow.top + lastRow.height : 0;
}

/** Absolute position of an appointment block inside a day column. */
export function blockPosition(appointment: AppointmentTimes, tz: string, grid: CalendarGrid) {
  const { start, end } = appointmentMinutes(appointment, tz);
  const startPx = minutePosition(start, grid);
  const top = startPx + BLOCK_INSET_PX;
  const height = Math.max(minutePosition(end, grid) - startPx - BLOCK_INSET_PX * 2, BLOCK_MIN_PX);
  return { top, height };
}

export type Laned<T> = T & { lane: number; lanes: number };

/**
 * Splits overlapping appointments (different doctors at the same time) into side-by-side lanes.
 * Appointments must belong to one day column.
 */
export function assignLanes<T extends { startsAt: string; endsAt: string }>(
  items: T[],
): Laned<T>[] {
  const sorted = [...items].sort(
    (a, b) => a.startsAt.localeCompare(b.startsAt) || a.endsAt.localeCompare(b.endsAt),
  );
  const result: Laned<T>[] = [];
  let cluster: { item: T; lane: number }[] = [];
  let clusterEnd = "";
  const laneEnds: string[] = [];

  const flush = () => {
    const lanes = Math.max(laneEnds.length, 1);
    for (const c of cluster) result.push({ ...c.item, lane: c.lane, lanes });
    cluster = [];
    laneEnds.length = 0;
  };

  for (const item of sorted) {
    if (cluster.length > 0 && item.startsAt >= clusterEnd) flush();
    let lane = laneEnds.findIndex((end) => end <= item.startsAt);
    if (lane === -1) lane = laneEnds.length;
    laneEnds[lane] = item.endsAt;
    cluster.push({ item, lane });
    if (item.endsAt > clusterEnd || cluster.length === 1)
      clusterEnd = item.endsAt > clusterEnd ? item.endsAt : clusterEnd;
  }
  flush();
  return result;
}
