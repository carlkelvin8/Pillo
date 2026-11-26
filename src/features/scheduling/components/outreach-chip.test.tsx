import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { OutreachChip } from "./waitlist";

describe("OutreachChip", () => {
  it("says OK to message only when outreach is on and the patient consented", () => {
    render(<OutreachChip outreach consented />);
    expect(screen.getByText("OK to message")).toBeInTheDocument();
  });
  it("warns when outreach is on but the patient has not consented, so no offers go out", () => {
    render(<OutreachChip outreach consented={false} />);
    expect(screen.getByText("Needs patient consent")).toBeInTheDocument();
  });
  it("says outreach is off otherwise", () => {
    render(<OutreachChip outreach={false} consented />);
    expect(screen.getByText("Outreach off")).toBeInTheDocument();
  });
});
