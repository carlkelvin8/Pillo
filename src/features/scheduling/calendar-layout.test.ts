import { describe, expect, it } from "vitest";
import { assignLanes, blockPosition, calendarGrid } from "./calendar-layout";

const TZ = "Asia/Manila";
const at = (h: number, m = 0) => new Date(Date.UTC(2027, 0, 12, h - 8, m)).toISOString();

describe("blockPosition", () => {
  it("aligns a booked block after a compact empty row", () => {
    const appointment = { startsAt: at(9), endsAt: at(10) };
    const grid = calendarGrid([{ start: "08:00", end: "10:00" }], [appointment], TZ);
    expect(blockPosition(appointment, TZ, grid)).toEqual({ top: 42, height: 92 });
  });

  it("preserves the height of short appointments and keeps them inside the grid", () => {
    const appointment = { startsAt: at(9, 45), endsAt: at(10) };
    const grid = calendarGrid([], [appointment], TZ);
    expect(blockPosition(appointment, TZ, grid)).toEqual({ top: 74, height: 44 });
    expect(grid.height).toBe(120);
  });
});

describe("calendarGrid", () => {
  it("fits the range to opening hours and includes appointments outside those hours", () => {
    const windows = [{ start: "09:00", end: "12:30" }];
    expect(calendarGrid(windows, [], TZ).rows.map((row) => row.hour)).toEqual([9, 10, 11, 12]);
    const appointments = [
      { startsAt: at(8, 30), endsAt: at(9, 30) },
      { startsAt: at(12, 30), endsAt: at(14) },
    ];
    expect(calendarGrid(windows, appointments, TZ).rows.map((row) => row.hour)).toEqual([
      8, 9, 10, 11, 12, 13,
    ]);
  });

  it("compacts unbooked afternoon hours while keeping every open hour visible", () => {
    const appointment = { startsAt: at(14, 45), endsAt: at(15, 30) };
    const grid = calendarGrid([{ start: "13:00", end: "18:00" }], [appointment], TZ);
    expect(grid.rows.map((row) => [row.hour, row.height])).toEqual([
      [13, 40],
      [14, 96],
      [15, 96],
      [16, 40],
      [17, 40],
    ]);
    expect(grid.height).toBe(312);
    expect(blockPosition(appointment, TZ, grid)).toEqual({ top: 114, height: 68 });
  });

  it("uses a compact daytime fallback when no hours or appointments are visible", () => {
    const grid = calendarGrid([], [], TZ);
    expect(grid.rows.map((row) => row.hour)).toEqual([8, 9, 10, 11, 12, 13, 14, 15, 16, 17]);
    expect(grid.height).toBe(400);
  });

  it("keeps an appointment ending at midnight in its starting-day column", () => {
    const appointment = { startsAt: at(23), endsAt: at(24) };
    const grid = calendarGrid([], [appointment], TZ);
    expect(grid.rows).toEqual([{ hour: 23, top: 0, height: 96 }]);
    expect(blockPosition(appointment, TZ, grid)).toEqual({ top: 2, height: 92 });
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

  it("separates back-to-back short appointments that would visually overlap", () => {
    const short = (id: string, from: number, m: number) => ({
      id,
      startsAt: at(from, m),
      endsAt: at(from, m + 15),
    });
    const out = assignLanes([short("a", 9, 0), short("b", 9, 15)]);
    expect(out.map((o) => [o.id, o.lane, o.lanes])).toEqual([
      ["a", 0, 2],
      ["b", 1, 2],
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
