import { dateOf, firstDayOfNextMonth, lastMonths, zonedToUtcIso } from "@/lib/datetime";

export function appointmentTrendRange(today: string, timezone: string) {
  const firstMonth = lastMonths(today, 12)[0];
  if (!firstMonth) throw new RangeError("A twelve-month appointment trend requires a month range");
  return {
    fromIso: zonedToUtcIso(`${firstMonth}-01`, "00:00", timezone),
    toIso: zonedToUtcIso(firstDayOfNextMonth(today), "00:00", timezone),
  };
}

export function countAppointmentStartsByMonth(startsAt: string[], timezone: string) {
  const counts = new Map<string, number>();
  for (const starts of startsAt) {
    const month = dateOf(starts, timezone).slice(0, 7);
    counts.set(month, (counts.get(month) ?? 0) + 1);
  }
  return counts;
}
