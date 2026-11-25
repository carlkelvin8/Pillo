import { minutesOfDay } from "@/lib/datetime";

export const HOUR_PX = 64;
export const HEADER_PX = 44;

export type GridRange = { startHour: number; endHour: number };

/** Visible hour range: covers branch hours and any appointment, never narrower than 8 AM to 6 PM (the design shows a 5 PM row). */
export function gridRange(
  openWindows: { start: string; end: string }[],
  appointments: { startsAt: string; endsAt: string }[],
  tz: string,
): GridRange {
  let start = 8 * 60;
  let end = 18 * 60;
  const [firstOpen] = openWindows;
  if (firstOpen) {
    start = Math.min(...openWindows.map((w) => hm(w.start)));
    end = Math.max(...openWindows.map((w) => hm(w.end)));
    start = Math.min(start, 8 * 60);
    end = Math.max(end, 18 * 60);
  }
  for (const a of appointments) {
    start = Math.min(start, minutesOfDay(a.startsAt, tz));
    end = Math.max(end, minutesOfDay(a.endsAt, tz));
  }
  return { startHour: Math.floor(start / 60), endHour: Math.ceil(end / 60) };
}

const hm = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

/** Absolute position of an appointment block inside a day column. */
export function blockPosition(startsAt: string, endsAt: string, tz: string, startHour: number) {
  const startMin = minutesOfDay(startsAt, tz);
  let endMin = minutesOfDay(endsAt, tz);
  if (endMin <= startMin) endMin = startMin + 30; // crosses midnight or zero length: clamp
  const top = ((startMin - startHour * 60) / 60) * HOUR_PX + 2;
  const height = Math.max(((endMin - startMin) / 60) * HOUR_PX - 4, 24);
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
