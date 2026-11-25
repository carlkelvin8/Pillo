import { MCP_TOOL_CATALOG } from "./catalog";

export type McpActivityItem = {
  at: string;
  label: string;
  detail: string;
  severity: "normal" | "warning" | "failure";
};

type AuditRow = { at: string; action: string; meta: unknown };

const FIXED_EVENTS: Record<string, Omit<McpActivityItem, "at">> = {
  "mcp.token_created": { label: "Client token created", detail: "Access issued", severity: "normal" },
  "mcp.token_revoked": { label: "Client token revoked", detail: "Access disabled", severity: "warning" },
  "mcp.payment_request_approved": { label: "Payment request approved", detail: "Link created or reused", severity: "normal" },
  "mcp.payment_request_rejected": { label: "Payment request rejected", detail: "Staff declined request", severity: "warning" },
  "mcp.payment_request_failed": { label: "Payment link creation failed", detail: "Approval recorded; link unavailable", severity: "failure" },
};

const knownTools = new Set<string>(MCP_TOOL_CATALOG.map((tool) => tool.name));

export function projectMcpActivity(rows: AuditRow[]): McpActivityItem[] {
  return rows.flatMap((row) => {
    if (row.action === "mcp.tool_called") {
      const meta = row.meta;
      if (!meta || typeof meta !== "object" || Array.isArray(meta)) return [];
      const tool = (meta as Record<string, unknown>).tool;
      const outcome = (meta as Record<string, unknown>).outcome;
      if (typeof tool !== "string" || !knownTools.has(tool)) return [];
      if (outcome !== "success" && outcome !== "failure") return [];
      return [{ at: row.at, label: tool, detail: outcome === "success" ? "Completed" : "Failed", severity: outcome === "success" ? "normal" as const : "failure" as const }];
    }
    const event = FIXED_EVENTS[row.action];
    return event ? [{ at: row.at, ...event }] : [];
  });
}
