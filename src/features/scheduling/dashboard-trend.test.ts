import { beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({ createClient: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({ createClient: mock.createClient }));

import { appointmentTrendRange, countAppointmentStartsByMonth } from "./dashboard-trend";
import { monthlyAppointmentCounts } from "./queries";

function makeSupabase(pages: { starts_at: string }[][]) {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    neq: vi.fn(),
    gte: vi.fn(),
    lt: vi.fn(),
    order: vi.fn(),
    range: vi.fn(),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.neq.mockReturnValue(query);
  query.gte.mockReturnValue(query);
  query.lt.mockReturnValue(query);
  query.order.mockReturnValue(query);
  query.range.mockImplementation(async (from: number) => ({
    data: pages[from / 1_000] ?? [],
    error: null,
  }));
  mock.createClient.mockResolvedValue({ from: vi.fn(() => query) });
  return query;
}

describe("countAppointmentStartsByMonth", () => {
  it("groups appointments by clinic-local month, including UTC month crossover", () => {
    const counts = countAppointmentStartsByMonth(
      ["2026-02-28T08:00:00.000Z", "2026-02-28T16:30:00.000Z", "2026-03-01T01:00:00.000Z"],
      "Asia/Manila",
    );

    expect(counts).toEqual(
      new Map([
        ["2026-02", 1],
        ["2026-03", 2],
      ]),
    );
  });
});

describe("appointmentTrendRange", () => {
  it("covers the full current month in clinic-local time", () => {
    expect(appointmentTrendRange("2026-11-25", "Asia/Manila")).toEqual({
      fromIso: "2025-11-30T16:00:00.000Z",
      toIso: "2026-11-30T16:00:00.000Z",
    });
  });
});

describe("monthlyAppointmentCounts", () => {
  beforeEach(() => vi.clearAllMocks());

  it("queries only start timestamps, excludes cancelled appointments, and paginates", async () => {
    const fullPage = Array.from({ length: 1_000 }, () => ({ starts_at: "2026-01-15T02:00:00Z" }));
    const query = makeSupabase([fullPage, [{ starts_at: "2026-03-01T01:00:00Z" }]]);

    const result = await monthlyAppointmentCounts(
      "clinic-id",
      "2025-12-01T00:00:00Z",
      "2026-11-25T00:00:00Z",
      "Asia/Manila",
    );

    expect(query.select).toHaveBeenCalledWith("starts_at");
    expect(query.eq).toHaveBeenCalledWith("clinic_id", "clinic-id");
    expect(query.neq).toHaveBeenCalledWith("status", "cancelled");
    expect(query.gte).toHaveBeenCalledWith("starts_at", "2025-12-01T00:00:00Z");
    expect(query.lt).toHaveBeenCalledWith("starts_at", "2026-11-25T00:00:00Z");
    expect(query.range.mock.calls).toEqual([
      [0, 999],
      [1_000, 1_999],
    ]);
    expect(result.get("2026-01")).toBe(1_000);
    expect(result.get("2026-03")).toBe(1);
  });
});
