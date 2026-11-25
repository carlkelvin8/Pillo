import { describe, expect, it } from "vitest";
import {
  addDays,
  dateOf,
  dayBoundsUtc,
  formatTime,
  formatWeekRange,
  firstDayOfNextMonth,
  isDateString,
  lastMonths,
  nextBusinessDay,
  minutesOfDay,
  startOfWeek,
  todayIn,
  weekdayOf,
  zonedToUtcIso,
} from "./datetime";

const TZ = "Asia/Manila";

describe("date strings", () => {
  it("validates real calendar dates only", () => {
    expect(isDateString("2027-02-28")).toBe(true);
    expect(isDateString("2027-02-30")).toBe(false);
    expect(isDateString("27-02-28")).toBe(false);
  });
  it("adds days across month and year ends", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2027-03-01", -1)).toBe("2027-02-28");
  });
  it("finds weekday and Monday-start week", () => {
    expect(weekdayOf("2026-11-24")).toBe(2); // Tuesday
    expect(startOfWeek("2026-11-24")).toBe("2026-11-23");
    expect(startOfWeek("2026-11-29")).toBe("2026-11-23"); // Sunday belongs to the week before
    expect(startOfWeek("2026-11-23")).toBe("2026-11-23");
  });
});

describe("lastMonths", () => {
  it("lists months oldest first, across a year boundary", () => {
    expect(lastMonths("2027-02-10", 4)).toEqual(["2026-11", "2026-12", "2027-01", "2027-02"]);
    expect(lastMonths("2026-11-24", 1)).toEqual(["2026-11"]);
  });
});

describe("firstDayOfNextMonth", () => {
  it("returns the first local calendar date of the following month", () => {
    expect(firstDayOfNextMonth("2026-11-25")).toBe("2026-12-01");
    expect(firstDayOfNextMonth("2026-12-31")).toBe("2027-01-01");
  });
});

describe("nextBusinessDay", () => {
  it("skips weekends", () => {
    expect(nextBusinessDay("2026-11-24")).toBe("2026-11-25"); // Tue -> Wed
    expect(nextBusinessDay("2026-11-27")).toBe("2026-11-30"); // Fri -> Mon
    expect(nextBusinessDay("2026-11-28")).toBe("2026-11-30"); // Sat -> Mon
  });
});

describe("clinic timezone conversion", () => {
  it("converts Manila local time to UTC (UTC+8, no DST)", () => {
    expect(zonedToUtcIso("2027-01-12", "09:00", TZ)).toBe("2027-01-12T01:00:00.000Z");
    expect(zonedToUtcIso("2027-01-12", "00:30", TZ)).toBe("2027-01-11T16:30:00.000Z");
  });
  it("computes the UTC bounds of a Manila day", () => {
    expect(dayBoundsUtc("2027-01-12", TZ)).toEqual({
      start: "2027-01-11T16:00:00.000Z",
      end: "2027-01-12T16:00:00.000Z",
    });
  });
  it("reads local date and time back from a UTC instant", () => {
    const iso = "2027-01-11T17:30:00.000Z"; // 01:30 on the 12th in Manila
    expect(dateOf(iso, TZ)).toBe("2027-01-12");
    expect(minutesOfDay(iso, TZ)).toBe(90);
    expect(todayIn(TZ, new Date("2027-01-11T16:30:00.000Z"))).toBe("2027-01-12");
  });
  it("formats times in 12-hour clinic time", () => {
    expect(formatTime("2027-01-12T01:00:00.000Z", TZ)).toBe("9:00 AM");
    expect(formatTime("2027-01-12T07:15:00.000Z", TZ)).toBe("3:15 PM");
  });
  it("formats week ranges", () => {
    expect(formatWeekRange("2026-11-23", "2026-11-27")).toBe("23 – 27 November");
    expect(formatWeekRange("2026-11-30", "2026-12-04")).toBe("30 November – 4 December");
  });
});
