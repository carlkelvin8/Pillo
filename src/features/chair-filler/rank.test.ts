import { describe, expect, it } from "vitest";
import { rankCandidates, type FreedSlot, type WaitlistCandidate } from "./rank";

const TZ = "Asia/Manila";
const manila = (h: number, m = 0) => new Date(Date.UTC(2027, 0, 14, h - 8, m)).toISOString(); // Thu 14 Jan 2027
const slot: FreedSlot = {
  branchId: "b1",
  doctorId: "d1",
  startsAt: manila(14),
  endsAt: manila(14, 30),
};
const NOW = new Date(Date.UTC(2027, 0, 14, 0, 0)); // 08:00 Manila, 6h before
const w = (id: string, over: Partial<WaitlistCandidate> = {}): WaitlistCandidate => ({
  id,
  patientId: `p-${id}`,
  branchId: null,
  doctorId: null,
  weekdays: [],
  earliest: null,
  latest: null,
  createdAt: `2027-01-0${id}T00:00:00Z`,
  ...over,
});
const rank = (
  waitlist: WaitlistCandidate[],
  over: Partial<Parameters<typeof rankCandidates>[0]> = {},
) =>
  rankCandidates({
    slot,
    tz: TZ,
    now: NOW,
    waitlist,
    consentedPatientIds: new Set(waitlist.map((x) => x.patientId)),
    busyByPatient: new Map(),
    ...over,
  }).map((x) => x.id);

describe("rankCandidates", () => {
  it("orders by who has waited longest and caps at 3", () => {
    expect(rank([w("4"), w("2"), w("3"), w("1")])).toEqual(["1", "2", "3"]);
  });
  it("requires consent on file", () => {
    const list = [w("1"), w("2")];
    expect(rank(list, { consentedPatientIds: new Set(["p-2"]) })).toEqual(["2"]);
    expect(rank(list, { consentedPatientIds: new Set() })).toEqual([]);
  });
  it("respects preferred branch and doctor", () => {
    expect(
      rank([
        w("1", { branchId: "other" }),
        w("2", { branchId: "b1" }),
        w("3", { doctorId: "d2" }),
        w("4", { doctorId: "d1" }),
      ]),
    ).toEqual(["2", "4"]);
  });
  it("respects preferred weekdays (Thursday = 4)", () => {
    expect(
      rank([w("1", { weekdays: [1, 2] }), w("2", { weekdays: [4] }), w("3", { weekdays: [] })]),
    ).toEqual(["2", "3"]);
  });
  it("respects the time window using clinic time", () => {
    const list = [
      w("1", { earliest: "15:00:00" }),
      w("2", { latest: "14:15:00" }),
      w("3", { earliest: "13:00", latest: "17:00" }),
    ];
    expect(rank(list)).toEqual(["3"]);
  });
  it("skips patients who are already busy at that time", () => {
    const busy = new Map([
      ["p-1", [{ startsAt: manila(14, 15), endsAt: manila(15) }]],
      ["p-2", [{ startsAt: manila(14, 30), endsAt: manila(15) }]],
    ]);
    expect(rank([w("1"), w("2")], { busyByPatient: busy })).toEqual(["2"]); // back-to-back is fine
  });
  it("never offers the slot back to the patient who cancelled", () => {
    expect(rank([w("1"), w("2")], { excludePatientIds: new Set(["p-1"]) })).toEqual(["2"]);
  });
  it("offers nothing when the slot is too close to start", () => {
    const soon = new Date(Date.UTC(2027, 0, 14, 5, 0)); // 13:00 Manila, 1h before
    expect(rank([w("1")], { now: soon })).toEqual([]);
    expect(rank([w("1")], { now: new Date(Date.UTC(2027, 0, 14, 4, 0)) })).toEqual(["1"]); // exactly 2h
  });
  it("offers nothing for a slot in the past", () => {
    expect(rank([w("1")], { now: new Date(Date.UTC(2027, 0, 15)) })).toEqual([]);
  });
  it("lists a patient once even with several waitlist entries", () => {
    expect(rank([w("1"), w("2", { patientId: "p-1" })])).toEqual(["1"]);
  });
});
