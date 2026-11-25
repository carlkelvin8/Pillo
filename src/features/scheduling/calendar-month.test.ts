import { describe, expect, it } from "vitest";
import { monthBounds, monthCells, shiftMonth } from "./calendar-month";

describe("monthBounds", () => {
  it("returns clinic-local inclusive start and exclusive next-month boundary", () => {
    expect(monthBounds("2027-01-18")).toEqual({ start: "2027-01-01", end: "2027-02-01" });
  });

  it("handles December rollover", () => {
    expect(monthBounds("2026-12-31")).toEqual({ start: "2026-12-01", end: "2027-01-01" });
  });
});

describe("shiftMonth", () => {
  it("moves across year boundaries and clamps the day to the target month", () => {
    expect(shiftMonth("2027-01-31", 1)).toBe("2027-02-28");
    expect(shiftMonth("2027-01-31", -1)).toBe("2026-12-31");
  });
});

describe("monthCells", () => {
  it("pads the first week from Monday and includes every day in the month", () => {
    const cells = monthCells("2027-01-01");
    expect(cells.slice(0, 5)).toEqual([null, null, null, null, "2027-01-01"]);
    expect(cells.filter(Boolean)).toHaveLength(31);
    expect(cells.at(-1)).toBe("2027-01-31");
  });

  it("uses 29 days for leap-year February", () => {
    expect(monthCells("2028-02-14").filter(Boolean)).toHaveLength(29);
  });
});
