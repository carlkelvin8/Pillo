import { beforeEach, describe, expect, it, vi } from "vitest";

const execute = vi.hoisted(() => vi.fn().mockResolvedValue([]));
const transaction = vi.hoisted(() => vi.fn());
const withMcpClinic = vi.hoisted(() => vi.fn());
const audit = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

vi.mock("./database", () => ({ withMcpClinic }));
vi.mock("./audit", () => ({ auditMcpCall: audit }));

import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { APP_NAME } from "@/config/brand";
import { buildMcpServer, safeToolMessage } from "./server";
import type { McpAuth } from "./auth";

const auth: McpAuth = { tokenId: "token-id", clinicId: "clinic-id", scopes: [] };

async function post(authContext: McpAuth, message: unknown, protocolVersion?: string) {
  const server = buildMcpServer(authContext);
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await server.connect(transport);
  try {
    const response = await transport.handleRequest(new Request("http://localhost/api/mcp", {
      method: "POST",
      headers: {
        accept: "application/json, text/event-stream",
        "content-type": "application/json",
        ...(protocolVersion ? { "mcp-protocol-version": protocolVersion } : {}),
      },
      body: JSON.stringify(message),
    }));
    return { status: response.status, body: await response.json() as Record<string, unknown> };
  } finally {
    await transport.close();
    await server.close();
  }
}

describe("MCP Streamable HTTP server", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    execute.mockReset().mockResolvedValue([]);
    transaction.mockReset();
    transaction.mockImplementation((work: (tx: { execute: typeof execute }) => Promise<unknown>) => work({ execute }));
    withMcpClinic.mockReset().mockImplementation((_clinicId: string, work: (tx: { execute: typeof execute }) => Promise<unknown>) => transaction(work));
    audit.mockClear();
  });

  it("initializes and lists the available scoped tools", async () => {
    const response = await post(auth, {
      jsonrpc: "2.0", id: 1, method: "initialize",
      params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "1.0" } },
    });
    expect(response.status).toBe(200);
    expect(response.body.result).toMatchObject({ serverInfo: { name: `${APP_NAME.toLowerCase()}-clinic` } });

    const listing = await post(auth, {
      jsonrpc: "2.0", id: 2, method: "tools/list", params: {},
    }, "2025-06-18");
    const tools = (listing.body.result as { tools: { name: string }[] }).tools;
    expect(tools.map((tool) => tool.name)).toEqual([
      "list_appointments", "find_patient", "get_patient_summary", "daily_summary",
      "book_appointment", "reschedule_appointment", "create_invoice", "request_payment",
    ]);
  });

  it("rejects a tool call without its required scope and records only a redacted outcome", async () => {
    const response = await post(auth, {
      jsonrpc: "2.0", id: 3, method: "tools/call",
      params: { name: "list_appointments", arguments: { from: "2026-11-25", to: "2026-11-25" } },
    }, "2025-06-18");
    expect(response.status).toBe(200);
    expect(response.body.result).toMatchObject({ isError: true });
    expect(execute).not.toHaveBeenCalled();
    expect(audit).toHaveBeenCalledWith(auth, "list_appointments", "failure");
  });

  it("enforces the bounded appointment range before querying the database", async () => {
    const response = await post({ ...auth, scopes: ["appointments:read"] }, {
      jsonrpc: "2.0", id: 4, method: "tools/call",
      params: { name: "list_appointments", arguments: { from: "2026-11-01", to: "2026-12-10" } },
    }, "2025-06-18");
    expect(response.body.result).toMatchObject({ isError: true });
    expect(execute).not.toHaveBeenCalled();
    expect(audit).toHaveBeenCalledWith({ ...auth, scopes: ["appointments:read"] }, "list_appointments", "failure");
  });

  it("returns clinic-filtered schedule facts for an allowed date range", async () => {
    execute
      .mockResolvedValueOnce([{ timezone: "Asia/Manila" }])
      .mockResolvedValueOnce([{ id: "appointment-id", patient_id: "patient-id", starts_at: "2026-11-25T02:00:00.000Z", status: "scheduled" }]);
    const response = await post({ ...auth, scopes: ["appointments:read"] }, {
      jsonrpc: "2.0", id: 5, method: "tools/call",
      params: { name: "list_appointments", arguments: { from: "2026-11-25", to: "2026-11-25" } },
    }, "2025-06-18");
    const result = response.body.result as { content: { text: string }[] };
    expect(JSON.parse(result.content[0]!.text)).toEqual([
      { id: "appointment-id", patient_id: "patient-id", starts_at: "2026-11-25T02:00:00.000Z", status: "scheduled" },
    ]);
    expect(audit).toHaveBeenCalledWith({ ...auth, scopes: ["appointments:read"] }, "list_appointments", "success");
  });

  it("searches only a bounded number of clinic patients under the patient scope", async () => {
    execute.mockResolvedValueOnce([{ id: "patient-id", patient_number: 12, full_name: "Sample Patient", phone: "09170000000", email: "sample@example.test" }]);
    const response = await post({ ...auth, scopes: ["patients:read"] }, {
      jsonrpc: "2.0", id: 10, method: "tools/call",
      params: { name: "find_patient", arguments: { query: "Sample" } },
    }, "2025-06-18");
    const result = response.body.result as { content: { text: string }[] };
    expect(JSON.parse(result.content[0]!.text)).toMatchObject([{ id: "patient-id", full_name: "Sample Patient" }]);
    expect(withMcpClinic).toHaveBeenCalledWith(auth.clinicId, expect.any(Function));
    const query = new PgDialect().sqlToQuery(execute.mock.calls[0]![0] as SQL);
    expect(query.sql).toMatch(/clinic_id/);
    expect(query.sql).toMatch(/limit 25/i);
    expect(query.params).toContain(auth.clinicId);
  });

  it("returns aggregate daily summary data for an allowed range", async () => {
    execute
      .mockResolvedValueOnce([{ timezone: "Asia/Manila" }])
      .mockResolvedValueOnce([{ status: "scheduled", count: 3 }])
      .mockResolvedValueOnce([{ collected_centavos: "150000" }])
      .mockResolvedValueOnce([{ status: "sent", count: 2 }]);
    const response = await post({ ...auth, scopes: ["daily_summary:read"] }, {
      jsonrpc: "2.0", id: 11, method: "tools/call",
      params: { name: "daily_summary", arguments: { from: "2026-11-25", to: "2026-11-25" } },
    }, "2025-06-18");
    const result = response.body.result as { content: { text: string }[] };
    expect(JSON.parse(result.content[0]!.text)).toEqual({
      appointments: [{ status: "scheduled", count: 3 }],
      payments: [{ collected_centavos: "150000" }],
      invoices: [{ status: "sent", count: 2 }],
    });
  });

  it("creates a payment proposal without creating a payment link", async () => {
    vi.stubEnv("ONLINE_PAYMENTS_ENABLED", "true");
    execute
      .mockResolvedValueOnce([{ id: "invoice-id", invoice_number: 42, total_centavos: "50000", status: "sent" }])
      .mockResolvedValueOnce([{ paid_centavos: "12000" }])
      .mockResolvedValueOnce([{ id: "proposal-id", status: "proposed" }]);
    const response = await post({ ...auth, scopes: ["payments:request"] }, {
      jsonrpc: "2.0", id: 6, method: "tools/call",
      params: { name: "request_payment", arguments: { invoice_id: "11111111-1111-4111-8111-111111111111" } },
    }, "2025-06-18");
    const result = response.body.result as { content: { text: string }[] };
    expect(JSON.parse(result.content[0]!.text)).toEqual({ request_id: "proposal-id", status: "awaiting_staff_approval" });
    expect(execute).toHaveBeenCalledTimes(3);
    expect(audit).toHaveBeenCalledWith({ ...auth, scopes: ["payments:request"] }, "request_payment", "success");
  });

  it("refuses payment requests while online payments are disabled", async () => {
    vi.stubEnv("ONLINE_PAYMENTS_ENABLED", "false");
    const response = await post({ ...auth, scopes: ["payments:request"] }, {
      jsonrpc: "2.0", id: 20, method: "tools/call",
      params: { name: "request_payment", arguments: { invoice_id: "11111111-1111-4111-8111-111111111111" } },
    }, "2025-06-18");
    const result = response.body.result as { isError: boolean; content: { text: string }[] };
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toBe("Online payment requests are not available yet.");
    expect(execute).not.toHaveBeenCalled();
  });

  it("keeps a committed success when the audit write fails", async () => {
    execute.mockResolvedValueOnce([{ id: "invoice-id", invoice_number: 42, status: "draft" }]);
    audit.mockRejectedValueOnce(Object.assign(new Error("secret detail"), { code: "XX000" }));
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const response = await post({ ...auth, scopes: ["invoices:write"] }, {
      jsonrpc: "2.0", id: 21, method: "tools/call",
      params: { name: "create_invoice", arguments: {
        patient_id: "11111111-1111-4111-8111-111111111111", due_on: "2026-12-10",
        items: [{ description: "Consultation", quantity: 1, unit_price_centavos: 50000 }],
      } },
    }, "2025-06-18");
    const result = response.body.result as { isError?: boolean };
    expect(result.isError).toBeUndefined();
    expect(JSON.stringify(errorLog.mock.calls)).not.toContain("secret detail");
    errorLog.mockRestore();
  });

  it("does not leak raw database errors to the client", async () => {
    execute.mockRejectedValueOnce(Object.assign(new Error('relation "x" violates something'), { code: "23505" }));
    const response = await post({ ...auth, scopes: ["invoices:write"] }, {
      jsonrpc: "2.0", id: 22, method: "tools/call",
      params: { name: "create_invoice", arguments: {
        patient_id: "11111111-1111-4111-8111-111111111111", due_on: "2026-12-10",
        items: [{ description: "Consultation", quantity: 1, unit_price_centavos: 50000 }],
      } },
    }, "2025-06-18");
    const result = response.body.result as { isError: boolean; content: { text: string }[] };
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toBe("The request could not be completed.");
  });

  it("returns patient demographics and appointment summary without clinical fields", async () => {
    execute
      .mockResolvedValueOnce([{ timezone: "Asia/Manila" }])
      .mockResolvedValueOnce([{ id: "patient-id", patient_number: 12, full_name: "Sample Patient", birthdate: "1990-01-01", sex: "female", phone: "09170000000", email: "sample@example.test" }])
      .mockResolvedValueOnce([{ id: "appointment-id", starts_at: "2026-11-25T02:00:00.000Z", ends_at: "2026-11-25T02:30:00.000Z", status: "confirmed", doctor_id: "doctor-id", branch_id: "branch-id" }]);
    const response = await post({ ...auth, scopes: ["patients:read"] }, {
      jsonrpc: "2.0", id: 7, method: "tools/call",
      params: { name: "get_patient_summary", arguments: { patient_id: "11111111-1111-4111-8111-111111111111" } },
    }, "2025-06-18");
    const result = response.body.result as { content: { text: string }[] };
    const payload = result.content[0]!.text;
    expect(payload).toContain("Sample Patient");
    expect(payload).not.toMatch(/clinical|prescriptions|vitals|notes/i);
    const queries = execute.mock.calls.slice(1).map(([query]) => new PgDialect().sqlToQuery(query as SQL).sql);
    expect(queries.join(" ")).not.toMatch(/public\.(visits|prescriptions)|\b(vitals|notes)\b/i);
    expect(audit).toHaveBeenCalledWith({ ...auth, scopes: ["patients:read"] }, "get_patient_summary", "success");
  });

  it("books only a verified open slot and keeps the appointment tenant-scoped", async () => {
    execute
      .mockResolvedValueOnce([{ timezone: "Asia/Manila" }])
      .mockResolvedValueOnce([{ weekday: 1, opens_at: "09:00", closes_at: "17:00" }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: "appointment-id", starts_at: "2026-11-30T02:00:00.000Z", ends_at: "2026-11-30T02:30:00.000Z", status: "scheduled" }]);
    const response = await post({ ...auth, scopes: ["appointments:write"] }, {
      jsonrpc: "2.0", id: 8, method: "tools/call",
      params: { name: "book_appointment", arguments: {
        patient_id: "11111111-1111-4111-8111-111111111111",
        doctor_id: "22222222-2222-4222-8222-222222222222",
        branch_id: "33333333-3333-4333-8333-333333333333",
        starts_at: "2026-11-30T02:00:00.000Z", duration_minutes: 30,
      } },
    }, "2025-06-18");
    const result = response.body.result as { content: { text: string }[] };
    expect(JSON.parse(result.content[0]!.text)).toMatchObject({ id: "appointment-id", status: "scheduled" });
    const insert = new PgDialect().sqlToQuery(execute.mock.calls[4]![0] as SQL);
    expect(insert.sql).toMatch(/insert into public\.appointments/);
    expect(insert.params).toContain(auth.clinicId);
    expect(audit).toHaveBeenCalledWith({ ...auth, scopes: ["appointments:write"] }, "book_appointment", "success");
  });

  it("reschedules only an active appointment into an open slot", async () => {
    execute
      .mockResolvedValueOnce([{ id: "appointment-id", starts_at: "2026-11-25T02:00:00.000Z", ends_at: "2026-11-25T02:30:00.000Z", status: "scheduled", doctor_id: "doctor-id", branch_id: "branch-id" }])
      .mockResolvedValueOnce([{ timezone: "Asia/Manila" }])
      .mockResolvedValueOnce([{ weekday: 1, opens_at: "09:00", closes_at: "17:00" }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: "appointment-id", starts_at: "2026-11-30T02:00:00.000Z", ends_at: "2026-11-30T02:30:00.000Z", status: "scheduled" }]);
    const response = await post({ ...auth, scopes: ["appointments:write"] }, {
      jsonrpc: "2.0", id: 12, method: "tools/call",
      params: { name: "reschedule_appointment", arguments: {
        appointment_id: "11111111-1111-4111-8111-111111111111", starts_at: "2026-11-30T02:00:00.000Z",
      } },
    }, "2025-06-18");
    const result = response.body.result as { content: { text: string }[] };
    expect(JSON.parse(result.content[0]!.text)).toMatchObject({ id: "appointment-id", status: "scheduled" });
    expect(execute).toHaveBeenCalledTimes(6);
    const update = new PgDialect().sqlToQuery(execute.mock.calls[5]![0] as SQL);
    expect(update.sql).toMatch(/update public\.appointments/);
    expect(update.params).toContain(auth.clinicId);
  });

  it("creates invoice items inside a transaction and leaves totals database-derived", async () => {
    execute.mockResolvedValueOnce([{ id: "invoice-id", invoice_number: 42, status: "draft" }]);
    const response = await post({ ...auth, scopes: ["invoices:write"] }, {
      jsonrpc: "2.0", id: 9, method: "tools/call",
      params: { name: "create_invoice", arguments: {
        patient_id: "11111111-1111-4111-8111-111111111111", due_on: "2026-12-10",
        total_centavos: 1,
        items: [{ description: "Consultation", quantity: 1, unit_price_centavos: 50000 }],
      } },
    }, "2025-06-18");
    const result = response.body.result as { content: { text: string }[] };
    expect(JSON.parse(result.content[0]!.text)).toEqual({ id: "invoice-id", invoice_number: 42, status: "draft" });
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(execute).toHaveBeenCalledTimes(2);
    const invoiceInsert = new PgDialect().sqlToQuery(execute.mock.calls[0]![0] as SQL);
    expect(invoiceInsert.sql).toMatch(/insert into public\.invoices/);
    expect(invoiceInsert.sql).not.toMatch(/total_centavos/);
    const itemInsert = new PgDialect().sqlToQuery(execute.mock.calls[1]![0] as SQL);
    expect(itemInsert.sql).toMatch(/insert into public\.invoice_items/);
    expect(itemInsert.params).toContain(auth.clinicId);
  });
});

describe("safeToolMessage", () => {
  it("passes our own errors through and maps database errors", () => {
    expect(safeToolMessage(new Error("This token needs the x scope."))).toBe("This token needs the x scope.");
    expect(safeToolMessage(Object.assign(new Error("exclusion violated"), { code: "23P01" }))).toBe("That time is no longer available.");
    expect(safeToolMessage(Object.assign(new Error("boom"), { code: "42501" }))).toBe("The request could not be completed.");
    expect(safeToolMessage({ code: "23P01" })).toBe("That time is no longer available.");
    expect(safeToolMessage("weird")).toBe("The request could not be completed.");
  });
});
