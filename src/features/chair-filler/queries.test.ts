import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockClient } = vi.hoisted(() => ({ mockClient: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mockClient }));

import { estimateRecovered, getChairFillerSummary } from "./queries";

const A = "00000000-0000-4000-8000-000000000001";
const B = "00000000-0000-4000-8000-000000000002";

function scripted(avg: number | null, filledIds: string[], completedCount: number) {
  const appointmentFilters: [string, unknown][] = [];
  const builder = (table: string) => {
    const q: Record<string, unknown> = {};
    for (const m of ["select", "not"]) q[m] = () => q;
    q.eq = (c: string, v: unknown) => {
      if (table === "appointments") appointmentFilters.push([c, v]);
      return q;
    };
    q.in = () => q;
    q.maybeSingle = async () => ({ data: { avg_visit_value_centavos: avg } });
    q.then = (resolve: (v: unknown) => unknown) =>
      Promise.resolve(
        table === "slot_offers"
          ? { data: filledIds.map((id) => ({ filled_appointment_id: id })) }
          : { count: completedCount },
      ).then(resolve);
    return q;
  };
  mockClient.mockResolvedValue({ from: builder });
  return appointmentFilters;
}

describe("getChairFillerSummary", () => {
  beforeEach(() => mockClient.mockReset());

  it("counts only completed visits that filled an accepted offer, times the typical value", async () => {
    const filters = scripted(150_000, [A, B], 1);
    expect(await getChairFillerSummary("clinic")).toEqual({
      filled: 2,
      kept: 1,
      avgVisitCentavos: 150_000,
      recoveredCentavos: 150_000,
    });
    expect(filters).toContainEqual(["status", "completed"]);
  });
  it("hides the peso figure until a value is set", async () => {
    scripted(null, [A], 1);
    expect(await getChairFillerSummary("clinic")).toMatchObject({
      kept: 1,
      recoveredCentavos: null,
    });
  });
  it("is zero with no filled slots", async () => {
    scripted(150_000, [], 0);
    expect(await getChairFillerSummary("clinic")).toMatchObject({
      filled: 0,
      kept: 0,
      recoveredCentavos: 0,
    });
  });
});

describe("estimateRecovered", () => {
  it("is kept visits times the owner's typical value, in centavos", () => {
    expect(estimateRecovered(3, 150_000)).toBe(450_000);
    expect(estimateRecovered(0, 150_000)).toBe(0);
  });
  it("is hidden (null) until the owner sets a value", () => {
    expect(estimateRecovered(3, null)).toBeNull();
  });
});
