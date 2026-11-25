/**
 * Role permission matrix. Source: the "Role permissions" table in the Staff and roles
 * design. This drives the UI (nav, buttons). The database (RLS) is what actually enforces
 * access; keep both in step when a capability becomes a real table policy.
 */
export const ROLES = ["owner", "doctor", "receptionist", "billing"] as const;
export type Role = (typeof ROLES)[number];

export const CAPABILITIES = [
  "schedule.view",
  "appointments.book",
  "patients.records",
  // Not in the design matrix: names and contact details, needed to book and bill. Clinical records stay owner/doctor.
  "patients.directory",
  "invoices.create",
  "payments.manage",
  "staff.manage",
  // Not in the design matrix; added so navigation has a rule. Review before Phase 4/5.
  "inbox.view",
  "integrations.manage",
] as const;
export type Capability = (typeof CAPABILITIES)[number];

export const CAPABILITY_LABELS: Record<Capability, string> = {
  "schedule.view": "View schedule",
  "appointments.book": "Book appointments",
  "patients.records": "Patient records",
  "patients.directory": "Patient directory",
  "invoices.create": "Create invoices",
  "payments.manage": "Payments and payouts",
  "staff.manage": "Manage staff",
  "inbox.view": "Dr. Pill inbox",
  "integrations.manage": "Integrations and MCP",
};

/** Capabilities shown in the matrix on the Staff and roles screen (design rows only). */
export const MATRIX_CAPABILITIES: readonly Capability[] = [
  "schedule.view",
  "appointments.book",
  "patients.records",
  "invoices.create",
  "payments.manage",
  "staff.manage",
];

export const ROLE_LABELS: Record<Role, string> = {
  owner: "Owner",
  doctor: "Doctor",
  receptionist: "Receptionist",
  billing: "Billing",
};

const ROLE_CAPABILITIES: Record<Role, readonly Capability[]> = {
  owner: [...CAPABILITIES],
  doctor: ["schedule.view", "appointments.book", "patients.records", "patients.directory"],
  receptionist: [
    "schedule.view",
    "appointments.book",
    "patients.directory",
    "invoices.create",
    "inbox.view",
  ],
  billing: ["schedule.view", "patients.directory", "invoices.create", "payments.manage"],
};

export function can(role: Role, capability: Capability): boolean {
  return ROLE_CAPABILITIES[role].includes(capability);
}

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}
