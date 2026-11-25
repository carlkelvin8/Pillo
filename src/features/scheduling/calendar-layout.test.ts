import { describe, expect, it } from "vitest";
import { assignLanes, blockPosition, gridRange } from "./calendar-layout";

const TZ = "Asia/Manila";
const at = (h: number, m = 0) => new Date(Date.UTC(2027, 0, 12, h - 8, m)).toISOString();

describe("blockPosition", () => {
  it("places a 9:00-10:00 block one hour below an 8 AM grid start", () => {
    expect(blockPosition(at(9), at(10), TZ, 8)).toEqual({ top: 66, height: 60 }); // matches the design: top 66, height 60
  });
  it("scales with duration and has a minimum height", () => {
    expect(blockPosition(at(9), at(9, 30), TZ, 8).height).toBe(28);
    expect(blockPosition(at(9), at(9, 5), TZ, 8).height).toBe(24);
  });
});

describe("gridRange", () => {
  it("defaults to 8 AM - 6 PM so a 5 PM row shows", () => {
    expect(gridRange([], [], TZ)).toEqual({ startHour: 8, endHour: 18 });
  });
  it("widens for late hours and early or late appointments", () => {
    expect(gridRange([{ start: "09:00", end: "19:30" }], [], TZ)).toEqual({
      startHour: 8,
      endHour: 20,
    });
    expect(gridRange([], [{ startsAt: at(7, 30), endsAt: at(8, 30) }], TZ).startHour).toBe(7);
  });
});

describe("assignLanes", () => {
  const appt = (id: string, from: number, to: number) => ({
    id,
    startsAt: at(from),
    endsAt: at(to),
  });

  it("keeps non-overlapping appointments in a single full-width lane", () => {
    const out = assignLanes([appt("a", 9, 10), appt("b", 10, 11)]);
    expect(out.map((o) => [o.id, o.lane, o.lanes])).toEqual([
      ["a", 0, 1],
      ["b", 0, 1],
    ]);
  });

  it("puts overlapping appointments side by side", () => {
    const out = assignLanes([appt("a", 9, 11), appt("b", 10, 11)]);
    expect(out.map((o) => [o.id, o.lane, o.lanes])).toEqual([
      ["a", 0, 2],
      ["b", 1, 2],
    ]);
  });

  it("reuses a freed lane and resets between clusters", () => {
    const out = assignLanes([
      appt("a", 9, 10),
      appt("b", 9, 12),
      appt("c", 10, 11),
      appt("d", 13, 14),
    ]);
    const byId = Object.fromEntries(out.map((o) => [o.id, o]));
    expect(byId.c?.lane).toBe(0); // takes the lane a freed
    expect(byId.b?.lanes).toBe(2);
    expect(byId.d).toMatchObject({ lane: 0, lanes: 1 });
  });
});
