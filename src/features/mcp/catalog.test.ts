import { describe, expect, it } from "vitest";
import { MCP_TOOL_CATALOG } from "./catalog";

describe("MCP tool catalog", () => {
  it("documents all eight tools using their required scope and safe behavior", () => {
    expect(MCP_TOOL_CATALOG).toHaveLength(8);
    expect(MCP_TOOL_CATALOG.map((tool) => tool.name)).toEqual([
      "list_appointments",
      "find_patient",
      "get_patient_summary",
      "daily_summary",
      "book_appointment",
      "reschedule_appointment",
      "create_invoice",
      "request_payment",
    ]);
    expect(MCP_TOOL_CATALOG.find((tool) => tool.name === "get_patient_summary")?.scope).toBe("patients:read");
    expect(MCP_TOOL_CATALOG.find((tool) => tool.name === "request_payment")?.access).toBe("Approval required");
    expect(MCP_TOOL_CATALOG.find((tool) => tool.name === "create_invoice")?.description).toMatch(/draft/i);
    expect(MCP_TOOL_CATALOG.find((tool) => tool.name === "get_patient_summary")?.description).not.toMatch(/vitals|prescriptions/i);
  });
});
