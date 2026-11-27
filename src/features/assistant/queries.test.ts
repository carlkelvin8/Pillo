import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockData, mockCreateClient } = vi.hoisted(() => ({
  mockData: { current: [] as unknown[] },
  mockCreateClient: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: mockCreateClient }));

import { getRules } from "./queries";

describe("getRules", () => {
  beforeEach(() => {
    mockData.current = [];
    const query = {
      select: vi.fn(() => query),
      eq: vi.fn(() => query),
      in: vi.fn(() => query),
      then: (resolve: (value: unknown) => unknown) =>
        Promise.resolve({ data: mockData.current, error: null }).then(resolve),
    };
    mockCreateClient.mockResolvedValue({ from: vi.fn(() => query) });
  });

  it("ignores rules for features outside the settings editor", async () => {
    mockData.current = [
      { kind: "reply", autonomy: "approve", daily_limit: 72 },
      { kind: "book_appointment", autonomy: "suggest", daily_limit: 12 },
      { kind: "chair_filler", autonomy: "auto", daily_limit: 5 },
    ];

    await expect(getRules("clinic-id")).resolves.toEqual({
      reply: { kind: "reply", autonomy: "approve", daily_limit: 72 },
      book_appointment: {
        kind: "book_appointment",
        autonomy: "suggest",
        daily_limit: 12,
      },
    });
  });
});

import { listActions } from "./queries";

describe("listActions", () => {
  it("reports the total instead of failing when the page is past the last row", async () => {
    const results = [
      { data: null, count: null, error: { code: "PGRST103" } },
      { data: null, count: 7, error: null },
    ];
    const query = {
      select: vi.fn(() => query),
      eq: vi.fn(() => query),
      neq: vi.fn(() => query),
      order: vi.fn(() => query),
      range: vi.fn(() => query),
      then: (resolve: (value: unknown) => unknown) =>
        Promise.resolve(results.shift()).then(resolve),
    };
    mockCreateClient.mockResolvedValue({ from: vi.fn(() => query) });

    await expect(listActions("clinic-id", 999)).resolves.toEqual({ rows: [], total: 7 });
  });
});
