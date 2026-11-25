import { describe, expect, it } from "vitest";
import { can, MATRIX_CAPABILITIES, ROLES, type Capability, type Role } from "./permissions";

// The "Role permissions" table from the Staff and roles design.
const designMatrix: Record<Capability & string, Role[]> = {
  "schedule.view": ["owner", "doctor", "receptionist", "billing"],
  "appointments.book": ["owner", "doctor", "receptionist"],
  "patients.records": ["owner", "doctor"],
  "invoices.create": ["owner", "receptionist", "billing"],
  "payments.manage": ["owner", "billing"],
  "staff.manage": ["owner"],
} as Record<Capability & string, Role[]>;

describe("permissions matrix", () => {
  it.each(MATRIX_CAPABILITIES)("matches the design for %s", (capability) => {
    const allowed = ROLES.filter((role) => can(role, capability));
    expect(allowed).toEqual(designMatrix[capability]);
  });

  it("owners can do everything", () => {
    for (const cap of MATRIX_CAPABILITIES) expect(can("owner", cap)).toBe(true);
  });

  it("only owners manage staff and integrations", () => {
    expect(ROLES.filter((r) => can(r, "staff.manage"))).toEqual(["owner"]);
    expect(ROLES.filter((r) => can(r, "integrations.manage"))).toEqual(["owner"]);
  });
});
