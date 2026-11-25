import { dateOf, minutesOfDay, toMinutes, weekdayOf } from "@/lib/datetime";

export type WaitlistCandidate = {
  id: string;
  patientId: string;
  branchId: string | null;
  doctorId: string | null;
  weekdays: number[];
  earliest: string | null;
  latest: string | null;
  createdAt: string;
};
export type FreedSlot = { branchId: string; doctorId: string; startsAt: string; endsAt: string };
type Busy = { startsAt: string; endsAt: string };

export const MIN_LEAD_MINUTES = 120;
export const MAX_OFFERS_PER_SLOT = 3;

/**
 * Who should be offered a freed slot? Only people who are waiting, agreed to be contacted AND have
 * consent on file; whose preferences fit; who are free then; oldest request first.
 */
export function rankCandidates(args: {
  slot: FreedSlot;
  tz: string;
  now: Date;
  waitlist: WaitlistCandidate[];
  consentedPatientIds: Set<string>;
  busyByPatient: Map<string, Busy[]>;
  excludePatientIds?: Set<string>;
  minLeadMinutes?: number;
  max?: number;
}): WaitlistCandidate[] {
  const { slot, tz, now, waitlist, consentedPatientIds, busyByPatient } = args;
  const startMs = new Date(slot.startsAt).getTime();
  const endMs = new Date(slot.endsAt).getTime();
  // Too close to the start: not enough time for a person to read and answer.
  if (startMs - now.getTime() < (args.minLeadMinutes ?? MIN_LEAD_MINUTES) * 60_000) return [];

  const weekday = weekdayOf(dateOf(slot.startsAt, tz));
  const startMin = minutesOfDay(slot.startsAt, tz);
  const endMin = startMin + Math.round((endMs - startMs) / 60_000);

  const seen = new Set<string>();
  const fits = (w: WaitlistCandidate) => {
    if (!consentedPatientIds.has(w.patientId)) return false;
    if (args.excludePatientIds?.has(w.patientId)) return false;
    if (w.branchId && w.branchId !== slot.branchId) return false;
    if (w.doctorId && w.doctorId !== slot.doctorId) return false;
    if (w.weekdays.length > 0 && !w.weekdays.includes(weekday)) return false;
    if (w.earliest && startMin < toMinutes(w.earliest)) return false;
    if (w.latest && endMin > toMinutes(w.latest)) return false;
    const busy = busyByPatient.get(w.patientId) ?? [];
    return !busy.some(
      (b) => new Date(b.startsAt).getTime() < endMs && new Date(b.endsAt).getTime() > startMs,
    );
  };

  return [...waitlist]
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .filter(fits)
    .filter((w) => (seen.has(w.patientId) ? false : (seen.add(w.patientId), true)))
    .slice(0, args.max ?? MAX_OFFERS_PER_SLOT);
}
