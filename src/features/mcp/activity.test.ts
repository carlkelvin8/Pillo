import { describe, expect, it } from "vitest";
import { projectMcpActivity } from "./activity";

describe("MCP activity projection", () => {
  it("shows safe tool, token, and payment events without audit metadata", () => {
    const rows = projectMcpActivity([
      { at: "2026-11-25T02:41:00.000Z", action: "mcp.tool_called", meta: { tool: "request_payment", outcome: "success", patient_name: "must not render" } },
      { at: "2026-11-25T02:40:00.000Z", action: "mcp.token_created", meta: { scopes: "appointments:read" } },
      { at: "2026-11-25T02:39:00.000Z", action: "mcp.payment_request_failed", meta: {} },
    ]);

    expect(rows).toEqual([
      { at: "2026-11-25T02:41:00.000Z", label: "request_payment", detail: "Completed", severity: "normal" },
      { at: "2026-11-25T02:40:00.000Z", label: "Client token created", detail: "Access issued", severity: "normal" },
      { at: "2026-11-25T02:39:00.000Z", label: "Payment link creation failed", detail: "Approval recorded; link unavailable", severity: "failure" },
    ]);
  });

  it("drops unknown tools and unrelated audit events", () => {
    expect(projectMcpActivity([
      { at: "2026-11-25T02:41:00.000Z", action: "mcp.tool_called", meta: { tool: "unknown_tool", outcome: "success" } },
      { at: "2026-11-25T02:40:00.000Z", action: "patient.viewed", meta: {} },
    ])).toEqual([]);
  });
});
