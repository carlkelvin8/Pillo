import { describe, expect, it } from "vitest";
import { navForRole } from "./nav-config";

const labels = (role: Parameters<typeof navForRole>[0]) =>
  navForRole(role).flatMap((g) => g.items.map((i) => i.label));

describe("navForRole", () => {
  it("shows everything to owners", () => {
    expect(labels("owner")).toEqual([
      "Dashboard",
      "Appointments",
      "Patients",
      "Payments",
      "Invoices",
      "Dr. Pill",
      "Integrations",
      "Settings",
    ]);
  });
  it("hides money screens from doctors", () => {
    expect(labels("doctor")).toEqual(["Dashboard", "Appointments", "Patients"]);
  });
  it("gives billing money screens and the directory, but not settings", () => {
    expect(labels("billing")).toEqual([
      "Dashboard",
      "Appointments",
      "Patients",
      "Payments",
      "Invoices",
    ]);
  });
  it("gives receptionists the patient directory and the Dr. Pill inbox", () => {
    expect(labels("receptionist")).toEqual([
      "Dashboard",
      "Appointments",
      "Patients",
      "Invoices",
      "Dr. Pill",
    ]);
  });
  it("drops empty groups", () => {
    const groups = navForRole("doctor").map((g) => g.label);
    expect(groups).toEqual(["Workspace"]);
  });
});
