export const MCP_SCOPES = [
  "appointments:read",
  "patients:read",
  "daily_summary:read",
  "appointments:write",
  "invoices:write",
  "payments:request",
] as const;

export type McpScope = (typeof MCP_SCOPES)[number];

export const MCP_SCOPE_LABELS: Record<McpScope, string> = {
  "appointments:read": "Read appointments",
  "patients:read": "Search and read patient summaries",
  "daily_summary:read": "Read daily clinic summaries",
  "appointments:write": "Book and reschedule appointments",
  "invoices:write": "Create draft invoices",
  "payments:request": "Request payment links for staff approval",
};

const TOOL_SCOPES = {
  list_appointments: "appointments:read",
  find_patient: "patients:read",
  get_patient_summary: "patients:read",
  daily_summary: "daily_summary:read",
  book_appointment: "appointments:write",
  reschedule_appointment: "appointments:write",
  create_invoice: "invoices:write",
  request_payment: "payments:request",
} as const satisfies Record<string, McpScope>;

export type McpToolName = keyof typeof TOOL_SCOPES;

export function mcpToolScope(tool: McpToolName): McpScope {
  return TOOL_SCOPES[tool];
}

export function hasMcpScope(scopes: readonly string[], required: McpScope): boolean {
  return scopes.includes(required);
}
