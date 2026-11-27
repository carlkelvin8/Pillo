import { MCP_SCOPES, MCP_SCOPE_LABELS, type McpScope, type McpToolName } from "./scopes";

type McpTool = {
  name: McpToolName;
  scope: McpScope;
  description: string;
  access: "Read" | "Write" | "Approval required";
};

export const MCP_TOOL_CATALOG: readonly McpTool[] = [
  {
    name: "list_appointments",
    scope: "appointments:read",
    description: "Read appointments for a bounded date range.",
    access: "Read",
  },
  {
    name: "find_patient",
    scope: "patients:read",
    description: "Search clinic patients by name or phone number.",
    access: "Read",
  },
  {
    name: "get_patient_summary",
    scope: "patients:read",
    description:
      "Read patient demographics and appointment summary; clinical records are excluded.",
    access: "Read",
  },
  {
    name: "daily_summary",
    scope: "daily_summary:read",
    description: "Read aggregate appointment, collection, and invoice totals.",
    access: "Read",
  },
  {
    name: "book_appointment",
    scope: "appointments:write",
    description: "Book a patient into an available appointment slot.",
    access: "Write",
  },
  {
    name: "reschedule_appointment",
    scope: "appointments:write",
    description: "Move an existing appointment to an available slot.",
    access: "Write",
  },
  {
    name: "create_invoice",
    scope: "invoices:write",
    description: "Create an itemized draft invoice; it is not sent automatically.",
    access: "Write",
  },
  {
    name: "request_payment",
    scope: "payments:request",
    description: "Ask staff to review a payment-link request.",
    access: "Approval required",
  },
] as const;

export const MCP_SCOPE_CATALOG = MCP_SCOPES.map((scope) => ({
  scope,
  label: MCP_SCOPE_LABELS[scope],
  description: {
    "appointments:read": "Schedule, doctors, and availability",
    "patients:read": "Patient search and demographic summaries; off until selected",
    "daily_summary:read": "Aggregate clinic totals and counts",
    "appointments:write": "Book or move appointments",
    "invoices:write": "Create draft invoices only",
    "payments:request": "Request a link; staff must approve it",
  }[scope],
}));
