import { describe, expect, it } from "vitest";
import {
  doctorWorksOn,
  doctorHoursOverlap,
  generateSlots,
  isOpenSlot,
  upcomingOpenDates,
  type HourWindow,
} from "./slots";

const TZ = "Asia/Manila";
const TUE = "2027-01-12"; // weekday 2
const branch: HourWindow[] = [1, 2, 3, 4, 5].map((weekday) => ({
  weekday,
  start: "09:00",
  end: "12:00",
}));
const base = { date: TUE, tz: TZ, branchHours: branch, doctorHours: [], booked: [] };
const manila = (hhmm: string) =>
  `2027-01-12T${String(Number(hhmm.slice(0, 2)) - 8).padStart(2, "0")}:${hhmm.slice(3)}:00.000Z`;

describe("generateSlots", () => {
  it("fills the branch window in 30-minute steps", () => {
    expect(generateSlots(base)).toEqual(
      ["09:00", "09:30", "10:00", "10:30", "11:00", "11:30"].map(manila),
    );
  });

  it("returns nothing when the branch is closed that day", () => {
    expect(generateSlots({ ...base, date: "2027-01-10" })).toEqual([]); // Sunday
  });

  it("drops slots that overlap existing appointments, keeps back-to-back ones", () => {
    const booked = [{ startsAt: manila("10:00"), endsAt: manila("10:30") }];
    const slots = generateSlots({ ...base, booked });
    expect(slots).not.toContain(manila("10:00"));
    expect(slots).toContain(manila("09:30"));
    expect(slots).toContain(manila("10:30"));
  });

  it("blocks every slot a longer appointment would collide with", () => {
    const booked = [{ startsAt: manila("10:00"), endsAt: manila("10:30") }];
    const slots = generateSlots({ ...base, booked, durationMin: 60 });
    expect(slots).not.toContain(manila("09:30")); // 9:30-10:30 overlaps
    expect(slots).not.toContain(manila("10:00"));
    expect(slots).toContain(manila("10:30"));
  });

  it("does not offer a slot that would run past closing time", () => {
    const slots = generateSlots({ ...base, durationMin: 60 });
    expect(slots[slots.length - 1]).toBe(manila("11:00"));
  });

  it("restricts to the doctor's own windows (intersected with branch hours)", () => {
    const doctorHours: HourWindow[] = [{ weekday: 2, start: "10:00", end: "15:00" }];
    expect(generateSlots({ ...base, doctorHours })).toEqual(
      ["10:00", "10:30", "11:00", "11:30"].map(manila),
    );
  });

  it("treats a weekday missing from a doctor's windows as a day off", () => {
    const doctorHours: HourWindow[] = [{ weekday: 3, start: "09:00", end: "12:00" }];
    expect(generateSlots({ ...base, doctorHours })).toEqual([]);
  });

  it("skips slots at or before 'now'", () => {
    const now = new Date(manila("10:00"));
    const slots = generateSlots({ ...base, now });
    expect(slots[0]).toBe(manila("10:30"));
  });

  it("validates a requested start", () => {
    expect(isOpenSlot(base, manila("09:30"))).toBe(true);
    expect(isOpenSlot(base, manila("09:15"))).toBe(false);
    expect(isOpenSlot(base, manila("13:00"))).toBe(false);
  });
});

describe("upcomingOpenDates", () => {
  it("lists the next open days, skipping closed weekdays", () => {
    expect(upcomingOpenDates("2027-01-15", branch, 3)).toEqual([
      "2027-01-15",
      "2027-01-18",
      "2027-01-19",
    ]); // Fri, Mon, Tue
  });
  it("returns nothing for a branch with no hours", () => {
    expect(upcomingOpenDates("2027-01-15", [], 3)).toEqual([]);
  });
});

describe("doctorWorksOn", () => {
  it("is true whenever the branch is open and the doctor has no custom hours", () => {
    expect(doctorWorksOn(TUE, branch, [])).toBe(true);
    expect(doctorWorksOn("2027-01-10", branch, [])).toBe(false); // Sunday, branch closed
  });
  it("respects the doctor's own days", () => {
    expect(doctorWorksOn(TUE, branch, [{ weekday: 3, start: "09:00", end: "12:00" }])).toBe(false);
    expect(doctorWorksOn(TUE, branch, [{ weekday: 2, start: "13:00", end: "17:00" }])).toBe(false); // outside branch hours
    expect(doctorWorksOn(TUE, branch, [{ weekday: 2, start: "10:00", end: "14:00" }])).toBe(true);
  });
});

describe("doctorHoursOverlap", () => {
  const proposed: HourWindow = { weekday: 2, start: "10:00", end: "12:00" };

  it("rejects overlapping windows on the same weekday", () => {
    expect(doctorHoursOverlap(proposed, [{ weekday: 2, start: "11:30", end: "13:00" }])).toBe(true);
  });

  it("allows adjacent windows and windows on another weekday", () => {
    expect(doctorHoursOverlap(proposed, [
      { weekday: 2, start: "08:00", end: "10:00" },
      { weekday: 3, start: "10:00", end: "12:00" },
    ])).toBe(false);
  });
});
