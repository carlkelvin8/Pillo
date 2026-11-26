import { beforeEach, describe, expect, it, vi } from "vitest";

const user = { id: "11111111-1111-4111-8111-111111111111", email: "a@b.co", user_metadata: {} };
const clinic = {
  id: "2b6f0c1e-5a4d-4c3b-9e8f-1a2b3c4d5e6f",
  name: "Clinic",
  address: null,
  phone: null,
  email: null,
  timezone: "Asia/Manila",
  assistant_settings: {},
  onboarding_completed_at: "2026-01-01T00:00:00Z",
};
const selects: string[] = [];
let failFirst = true;

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, cache: <T,>(fn: T) => fn };
});
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user } }) },
    rpc: async () => ({}),
    from: () => {
      const q = {
        select: (cols: string) => {
          selects.push(cols);
          return q;
        },
        eq: () => q,
        order: () => q,
        limit: async () => {
          if (failFirst && selects.length === 1) {
            return { data: null, error: { code: "42703" } };
          }
          return { data: [{ id: "3c7a1d2e-6b5e-4d4c-8f9a-2b3c4d5e6f70", role: "owner", clinic }], error: null };
        },
      };
      return q;
    },
  }),
}));

import { getWorkspace } from "./workspace";

describe("getWorkspace logo_path fallback", () => {
  beforeEach(() => {
    selects.length = 0;
    failFirst = true;
  });

  it("retries without logo_path on 42703 with different query text", async () => {
    const ws = await getWorkspace();
    expect(ws?.membership?.clinic.id).toBe(clinic.id);
    expect(selects).toHaveLength(2);
    expect(selects[0]).toContain("logo_path");
    expect(selects[1]).not.toContain("logo_path");
    expect(selects[1]).not.toBe(selects[0]);
  });
});
