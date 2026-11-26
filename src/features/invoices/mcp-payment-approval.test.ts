import { beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({
  getWorkspace: vi.fn(),
  createClient: vi.fn(),
  getInvoice: vi.fn(),
  amountPaid: vi.fn(),
  getPaymentProvider: vi.fn(),
  logAudit: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mock.revalidatePath }));
vi.mock("@/features/audit/log", () => ({ logAudit: mock.logAudit }));
vi.mock("@/features/auth/workspace", () => ({ getWorkspace: mock.getWorkspace }));
vi.mock("@/features/payments/provider", () => ({ getPaymentProvider: mock.getPaymentProvider }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mock.createClient }));
vi.mock("./queries", () => ({ getInvoice: mock.getInvoice, amountPaid: mock.amountPaid }));

import { requestPaymentAction } from "./actions";

beforeEach(() => {
  vi.stubEnv("ONLINE_PAYMENTS_ENABLED", "true");
});

const invoiceId = "11111111-1111-4111-8111-111111111111";
const requestId = "22222222-2222-4222-8222-222222222222";

function setup({ providerFails = false, claimSucceeds = true } = {}) {
  const events: string[] = [];
  const chain = (result: unknown = { error: null }) => {
    const value: Record<string, unknown> = {};
    for (const method of ["select", "eq", "update", "insert"]) value[method] = () => value;
    value.maybeSingle = async () => ({ data: { payload: { invoice_id: invoiceId } }, error: null });
    value.then = (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve);
    return value;
  };
  const supabase = {
    from: vi.fn((table: string) => chain(table === "agent_actions" ? { data: { payload: { invoice_id: invoiceId } }, error: null } : { error: null })),
    rpc: vi.fn(async (name: string) => {
      events.push(name === "decide_mcp_payment_request" ? "claim" : "mark-failed");
      return { data: name === "decide_mcp_payment_request" ? claimSucceeds : true, error: null };
    }),
  };
  mock.getWorkspace.mockResolvedValue({
    user: { id: "user-id" },
    membership: { role: "receptionist", clinic: { id: "clinic-id" } },
  });
  mock.createClient.mockResolvedValue(supabase);
  mock.getInvoice.mockResolvedValue({
    invoice: { id: invoiceId, status: "draft", total_centavos: 50000, invoice_number: 42 },
    payments: [],
  });
  mock.amountPaid.mockReturnValue(0);
  mock.getPaymentProvider.mockReturnValue({
    createPaymentLink: vi.fn(async () => {
      events.push("create-link");
      if (providerFails) throw new Error("provider failure detail");
      return { provider: "mock", providerRef: "mock_ref", checkoutUrl: "https://pay.example/secret" };
    }),
  });
  return { events, supabase };
}

describe("MCP payment request approval", () => {
  beforeEach(() => vi.clearAllMocks());

  it("lets a receptionist approve an MCP request exactly once before creating a link", async () => {
    const { events, supabase } = setup();
    const form = new FormData();
    form.set("mcpRequestId", requestId);

    const result = await requestPaymentAction({}, form);

    expect(result.ok).toBe(true);
    expect(events.indexOf("claim")).toBeGreaterThanOrEqual(0);
    expect(events.indexOf("claim")).toBeLessThan(events.indexOf("create-link"));
    expect(supabase.rpc).toHaveBeenCalledWith("decide_mcp_payment_request", { p_action_id: requestId, p_approved: true });
  });

  it("marks a claimed request failed if link creation fails", async () => {
    const { events, supabase } = setup({ providerFails: true });
    const form = new FormData();
    form.set("mcpRequestId", requestId);

    const result = await requestPaymentAction({}, form);

    expect(result.ok).not.toBe(true);
    expect(events).toEqual(["claim", "create-link", "mark-failed"]);
    expect(supabase.rpc).toHaveBeenLastCalledWith("fail_mcp_payment_request", { p_action_id: requestId });
  });

  it("does not create a second link if another staff member already claimed the request", async () => {
    const { events } = setup({ claimSucceeds: false });
    const form = new FormData();
    form.set("mcpRequestId", requestId);

    const result = await requestPaymentAction({}, form);

    expect(result.ok).not.toBe(true);
    expect(events).toEqual(["claim"]);
    expect(mock.getPaymentProvider.mock.results[0]?.value.createPaymentLink).not.toHaveBeenCalled();
  });
});
