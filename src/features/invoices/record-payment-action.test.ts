import { beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({
  getWorkspace: vi.fn(),
  createClient: vi.fn(),
  getInvoice: vi.fn(),
  logAudit: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mock.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/features/audit/log", () => ({ logAudit: mock.logAudit }));
vi.mock("@/features/auth/workspace", () => ({ getWorkspace: mock.getWorkspace }));
vi.mock("@/features/payments/provider", () => ({ getPaymentProvider: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mock.createClient }));
vi.mock("./queries", async () => {
  const actual = await vi.importActual<{ amountPaid: unknown }>("./queries");
  return { getInvoice: mock.getInvoice, amountPaid: actual.amountPaid };
});

import { recordPaymentAction } from "./actions";

const invoiceId = "11111111-1111-4111-8111-111111111111";

function setup({ cancelFails = false, insertFails = false, payments = [] as unknown[] } = {}) {
  const ops: string[] = [];
  const supabase = {
    from: vi.fn(() => {
      let op = "";
      const value: Record<string, unknown> = {};
      for (const m of ["eq", "select"]) value[m] = () => value;
      value.update = () => ((op = "update"), value);
      value.insert = () => ((op = "insert"), value);
      value.then = (resolve: (v: unknown) => unknown) => {
        ops.push(op);
        const failed = (op === "update" && cancelFails) || (op === "insert" && insertFails);
        return Promise.resolve({ error: failed ? { message: "boom" } : null }).then(resolve);
      };
      return value;
    }),
  };
  mock.getWorkspace.mockResolvedValue({
    user: { id: "u" },
    membership: { role: "owner", clinic: { id: "c", timezone: "Asia/Manila" } },
  });
  mock.createClient.mockResolvedValue(supabase);
  mock.getInvoice.mockResolvedValue({
    invoice: { id: invoiceId, status: "sent", total_centavos: 50000, issued_on: "2024-01-10" },
    payments,
  });
  return ops;
}

function form(over: Record<string, string> = {}) {
  const f = new FormData();
  const v = { invoiceId, method: "cash", amount: "100", receivedOn: "", reference: "", ...over };
  for (const [k, val] of Object.entries(v)) f.set(k, val);
  return f;
}

beforeEach(() => {
  vi.stubEnv("ONLINE_PAYMENTS_ENABLED", "false");
  vi.clearAllMocks();
});

describe("recordPaymentAction", () => {
  it("rejects an amount above what is still due without writing", async () => {
    const ops = setup();
    const r = await recordPaymentAction({}, form({ amount: "600" }));
    expect(r.fieldErrors?.amount?.[0]).toBe("Amount is more than what is still due.");
    expect(ops).toEqual([]);
  });

  it("does not count pending links as paid", async () => {
    const ops = setup({ payments: [{ status: "pending", amount_centavos: 50000, checkout_url: "x" }] });
    const r = await recordPaymentAction({}, form({ amount: "500" }));
    expect(r.ok).toBe(true);
    expect(ops).toEqual(["update", "insert"]);
  });

  it("rejects a date before the invoice date without writing", async () => {
    const ops = setup();
    const r = await recordPaymentAction({}, form({ receivedOn: "2024-01-01" }));
    expect(r.fieldErrors?.receivedOn?.[0]).toBe("The date cannot be before the invoice date.");
    expect(ops).toEqual([]);
  });

  it("stops without inserting when cancelling the pending links fails", async () => {
    const ops = setup({ cancelFails: true });
    const r = await recordPaymentAction({}, form());
    expect(r.ok).toBeUndefined();
    expect(r.message).toMatch(/Nothing was recorded/);
    expect(ops).toEqual(["update"]);
  });

  it("returns an error when the insert fails", async () => {
    setup({ insertFails: true });
    const r = await recordPaymentAction({}, form());
    expect(r.message).toBe("We could not record that payment.");
  });
});
