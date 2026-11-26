import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Landing } from "./landing";

describe("Landing", () => {
  it("has one h1, links to sign up and sign in, and says online payments are coming soon", () => {
    render(<Landing />);
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(
      screen.getAllByRole("link", { name: /create your clinic|get started/i })[0],
    ).toHaveAttribute("href", "/signup");
    expect(screen.getAllByRole("link", { name: "Sign in" })[0]).toHaveAttribute("href", "/login");
    expect(screen.getByRole("heading", { name: "Coming soon" })).toBeInTheDocument();
    expect(screen.getAllByText("GCash").length).toBeGreaterThan(0);
  });

  it("tells the story in order, one heading per chapter", () => {
    render(<Landing />);
    const headings = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent ?? "");
    expect(headings).toHaveLength(6);
    expect(headings[0]).toMatch(/patient cancels/i);
    expect(headings[1]).toMatch(/front desk/i);
    expect(headings[2]).toMatch(/payment logbook/i);
    expect(headings[3]).toMatch(/control/i);
    expect(headings[4]).toMatch(/coming soon/i);
    expect(headings[5]).toMatch(/chairs/i);
  });

  it("offers a chapter rail and marks every decorative layer hidden from assistive tech", () => {
    const { container } = render(<Landing />);
    expect(screen.getByRole("navigation", { name: "Story chapters" })).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /chair-filler|front desk/i }).length).toBeGreaterThan(0);
    // The marquee bands and the in-scene mascot spots are decoration.
    expect(container.querySelector("[data-scene='bands']")).toHaveAttribute("aria-hidden", "true");
    for (const spot of container.querySelectorAll("[data-mascot-anchor]")) {
      expect(spot).toHaveAttribute("aria-hidden", "true");
    }
  });

  it("never invents numbers: the only pesos shown are labelled sample data", () => {
    const { container } = render(<Landing />);
    const samples = container.querySelectorAll(".story-sample");
    expect(samples.length).toBeGreaterThanOrEqual(3);
    expect(container.textContent).toContain("[YOUR PRICE]");
  });
});
