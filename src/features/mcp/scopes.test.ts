import { describe, expect, it } from "vitest";
import { MCP_SCOPES, hasMcpScope, mcpToolScope } from "./scopes";

describe("MCP scopes", () => {
  it("maps each tool to its least-privilege scope", () => {
    expect(mcpToolScope("get_patient_summary")).toBe("patients:read");
    expect(mcpToolScope("request_payment")).toBe("payments:request");
    expect(mcpToolScope("daily_summary")).toBe("daily_summary:read");
  });

  it("requires the explicit patient scope and rejects unknown scopes", () => {
    expect(MCP_SCOPES).toContain("patients:read");
    expect(hasMcpScope([], "patients:read")).toBe(false);
    expect(hasMcpScope(["patients:read"], "patients:read")).toBe(true);
  });
});
