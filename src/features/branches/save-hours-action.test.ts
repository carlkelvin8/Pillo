import { beforeEach, describe, expect, it, vi } from "vitest";

const U = "00000000-0000-4000-8000-000000000001";
const B = "00000000-0000-4000-8000-000000000002";
type RpcResult = { data: null; error: { message: string } | null };
const rpc = vi.fn<(name: string, args: unknown) => Promise<RpcResult>>(async () => ({ data: null, error: null }));
const from = vi.fn();

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/features/audit/log", () => ({ logAudit: vi.fn(async () => {}) }));
vi.mock("@/features/auth/workspace", () => ({
  getWorkspace: async () => ({
    user: { id: U },
    membership: { role: "owner", clinic: { id: U, timezone: "Asia/Manila" } },
  }),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ rpc, from }),
}));

import { saveHoursAction } from "./actions";

function form(open: boolean) {
  const f = new FormData();
  f.set("branchId", B);
  if (open) {
    f.set("open_1", "on");
    f.set("opens_1", "09:00");
    f.set("closes_1", "17:00");
  }
  return f;
}

describe("saveHoursAction", () => {
  beforeEach(() => {
    rpc.mockClear();
    from.mockClear();
    rpc.mockResolvedValue({ data: null, error: null });
  });

  it("saves the week in one save_branch_hours call", async () => {
    const result = await saveHoursAction({}, form(true));
    expect(result.ok).toBe(true);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("save_branch_hours", {
      p_clinic_id: U,
      p_branch_id: B,
      p_hours: [{ weekday: 1, opens_at: "09:00", closes_at: "17:00" }],
    });
    expect(from).not.toHaveBeenCalled();
  });

  it("sends an empty array when the branch is closed all week", async () => {
    const result = await saveHoursAction({}, form(false));
    expect(result.ok).toBe(true);
    expect(rpc).toHaveBeenCalledWith("save_branch_hours", { p_clinic_id: U, p_branch_id: B, p_hours: [] });
  });

  it("reports a failed save", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "boom" } });
    const result = await saveHoursAction({}, form(true));
    expect(result.ok).toBeUndefined();
    expect(result.message).toBe("We could not save the hours.");
  });
});
