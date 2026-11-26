import { beforeEach, describe, expect, it, vi } from "vitest";

const U = "00000000-0000-4000-8000-000000000001";
const P = "00000000-0000-4000-8000-000000000003";
const state: {
  existing: { data: unknown[] | null; error: { message: string } | null };
  insert: { data: unknown[] | null; error: { code?: string; message: string } | null };
} = { existing: { data: [], error: null }, insert: { data: [{ id: U }], error: null } };

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/features/audit/log", () => ({ logAudit: vi.fn(async () => {}) }));
vi.mock("@/features/chair-filler/propose", () => ({ proposeOffers: vi.fn(async () => 0) }));
vi.mock("@/features/auth/workspace", () => ({
  getWorkspace: async () => ({
    user: { id: U },
    membership: { role: "receptionist", clinic: { id: U, timezone: "Asia/Manila" } },
  }),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: () => {
      const read: Record<string, unknown> = {};
      for (const m of ["eq", "in"]) read[m] = () => read;
      read.limit = () => Promise.resolve(state.existing);
      return {
        select: () => read,
        insert: () => ({ select: () => Promise.resolve(state.insert) }),
      };
    },
  }),
}));

import { addWaitlistAction } from "./actions";

function form() {
  const f = new FormData();
  f.set("patientId", P);
  f.set("reason", "Cleaning");
  return f;
}

describe("addWaitlistAction", () => {
  beforeEach(() => {
    state.existing = { data: [], error: null };
    state.insert = { data: [{ id: U }], error: null };
  });

  it("maps a unique violation (concurrent add) to the already-on-waitlist message", async () => {
    state.insert = { data: null, error: { code: "23505", message: "duplicate key" } };
    const r = await addWaitlistAction({}, form());
    expect(r.ok).toBeUndefined();
    expect(r.message).toContain("already on the waitlist");
  });

  it("fails when the duplicate check itself errors", async () => {
    state.existing = { data: null, error: { message: "boom" } };
    const r = await addWaitlistAction({}, form());
    expect(r.ok).toBeUndefined();
    expect(r.message).toBe("We could not add to the waitlist.");
  });

  it("reports an existing active entry", async () => {
    state.existing = { data: [{ id: U }], error: null };
    const r = await addWaitlistAction({}, form());
    expect(r.message).toContain("already on the waitlist");
  });
});
