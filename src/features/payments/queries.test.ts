import { beforeEach, describe, expect, it, vi } from "vitest";

const supabase = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: supabase.createClient }));

import { collectionsData } from "./queries";

describe("collectionsData", () => {
  beforeEach(() => {
    const query = {
      select: vi.fn(),
      eq: vi.fn(),
      gte: vi.fn(),
      order: vi.fn(),
      range: vi.fn(),
    };
    for (const method of ["select", "eq", "gte", "order"] as const) {
      query[method].mockReturnValue(query);
    }
    query.range.mockImplementation(async (from: number) => ({
      data:
        from === 0
          ? Array.from({ length: 1000 }, (_, index) => ({
              id: `payment-${String(index).padStart(4, "0")}`,
              method: "gcash",
              amount_centavos: 100,
              paid_at: "2026-06-03T09:00:00.000Z",
            }))
          : [
              {
                id: "payment-1000",
                method: "cash",
                amount_centavos: 500,
                paid_at: "2026-06-04T09:00:00.000Z",
              },
            ],
      error: null,
    }));
    supabase.createClient.mockResolvedValue({
      from: vi.fn(() => query),
    });
  });

  it("reads every page and aggregates all succeeded payments", async () => {
    const result = await collectionsData("clinic-id", "2025-06-01T00:00:00.000Z", "Asia/Manila");

    expect(result.rows).toHaveLength(1001);
    expect(result.byMethod.get("gcash")).toBe(100_000);
    expect(result.byMethod.get("cash")).toBe(500);
    expect([...result.byMonth.entries()]).toEqual([["2026-06", 100_500]]);
  });
});
