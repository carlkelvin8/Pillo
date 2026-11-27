import { beforeEach, describe, expect, it, vi } from "vitest";

const U = "00000000-0000-4000-8000-000000000001";
const calls: { inArgs?: unknown[]; rows: unknown[] } = { rows: [] };
const propose = vi.fn(async () => 0);

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/features/audit/log", () => ({ logAudit: vi.fn(async () => {}) }));
vi.mock("@/features/chair-filler/propose", () => ({ proposeOffers: (...a: unknown[]) => propose(...(a as [])) }));
vi.mock("@/features/auth/workspace", () => ({
  getWorkspace: async () => ({
    user: { id: U },
    membership: { role: "receptionist", clinic: { id: U, timezone: "Asia/Manila" } },
  }),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => {
    const q: Record<string, unknown> = {};
    for (const m of ["update", "eq"]) q[m] = () => q;
    q.in = (...a: unknown[]) => {
      calls.inArgs = a;
      return q;
    };
    q.select = () => Promise.resolve({ data: calls.rows, error: null });
    return { from: () => q };
  },
}));

import { setAppointmentStatusAction } from "./actions";

const form = (status: string) => {
  const f = new FormData();
  f.set("appointmentId", U);
  f.set("status", status);
  return f;
};

describe("setAppointmentStatusAction guard", () => {
  beforeEach(() => {
    calls.rows = [];
    calls.inArgs = undefined;
    propose.mockClear();
  });
  it("only updates open appointments", async () => {
    calls.rows = [{ id: U }];
    await setAppointmentStatusAction({}, form("cancelled"));
    expect(calls.inArgs).toEqual(["status", ["scheduled", "confirmed"]]);
  });
  it("reports a stale or repeated change and drafts no offers", async () => {
    calls.rows = []; // the row is already cancelled/completed, so the guarded update matches nothing
    const r = await setAppointmentStatusAction({}, form("cancelled"));
    expect(r.ok).toBeUndefined();
    expect(r.message).toContain("already updated");
    expect(propose).not.toHaveBeenCalled();
  });
  it("drafts offers after a successful cancel", async () => {
    calls.rows = [{ id: U }];
    const r = await setAppointmentStatusAction({}, form("cancelled"));
    expect(r.ok).toBe(true);
    expect(propose).toHaveBeenCalledTimes(1);
  });
});
