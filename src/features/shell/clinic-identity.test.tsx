import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ClinicIdentity } from "./clinic-identity";

describe("ClinicIdentity", () => {
  it("keeps the clinic name visually and semantically grouped with its context", () => {
    render(<ClinicIdentity clinicName="QA Dental Clinic" />);

    expect(screen.getByRole("group", { name: "Clinic workspace" })).toBeInTheDocument();
    expect(screen.getByText("CURRENT CLINIC")).toBeInTheDocument();
    expect(screen.getByText("QA Dental Clinic")).toHaveAttribute("title", "QA Dental Clinic");
  });
});
