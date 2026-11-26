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

  it("shows the first letter when there is no logo", () => {
    const { container } = render(<ClinicIdentity clinicName="dental clinic" />);
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByText("D")).toBeInTheDocument();
  });

  it("shows the uploaded logo instead of the letter", () => {
    const { container } = render(
      <ClinicIdentity clinicName="Dental Clinic" logoUrl="https://example.test/logo.png" />,
    );
    const img = container.querySelector("img");
    expect(img).toHaveAttribute("src", "https://example.test/logo.png");
    expect(img).toHaveAttribute("alt", "");
    expect(screen.queryByText("D")).toBeNull();
  });
});
