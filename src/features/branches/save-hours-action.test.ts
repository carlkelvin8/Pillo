import { beforeEach, describe, expect, it, vi } from "vitest";

const U = "00000000-0000-4000-8000-000000000001";
const B = "00000000-0000-4000-8000-000000000002";
const log: string[] = [];
let insertError: { message: string } | null = null;

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/features/audit/log", () => ({ logAudit: vi.fn(async () => {}) }));
vi.mock("@/features/auth/workspace", () => ({
  getWorkspace: async () => ({
    user: { id: U },
    membership: { role: "owner", clinic: { id: U, timezone: "Asia/Manila" } },
  }),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: () => {
      const q: Record<string, unknown> = {};
      q.eq = () => q;
      q.in = () => {
        log.push("delete-old");
        return Promise.resolve({ error: null });
      };
      q.select = () => {
        const read = { eq: () => read, then: undefined as unknown } as Record<string, unknown>;
        let calls = 0;
        read.eq = () => {
          calls += 1;
          if (calls === 2) {
            log.push("read-old");
            return Promise.resolve({ data: [{ id: "old-1" }], error: null });
          }
          return read;
        };
        return read;
      };
      q.insert = () => {
        log.push("insert-new");
        return Promise.resolve({ error: insertError });
      };
      q.delete = () => q;
      return q;
    },
  }),
}));

import { saveHoursAction } from "./actions";

function form() {
  const f = new FormData();
  f.set("branchId", B);
  f.set("open_1", "on");
  f.set("opens_1", "09:00");
  f.set("closes_1", "17:00");
  return f;
}

describe("saveHoursAction", () => {
  beforeEach(() => {
    log.length = 0;
    insertError = null;
  });

  it("inserts the new week before deleting the old rows", async () => {
    const result = await saveHoursAction({}, form());
    expect(result.ok).toBe(true);
    expect(log).toEqual(["read-old", "insert-new", "delete-old"]);
  });

  it("keeps the old hours when the insert fails", async () => {
    insertError = { message: "boom" };
    const result = await saveHoursAction({}, form());
    expect(result.ok).toBeUndefined();
    expect(log).toEqual(["read-old", "insert-new"]);
  });
});
