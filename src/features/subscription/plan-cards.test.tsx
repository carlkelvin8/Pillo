import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PlanCards } from "./plan-cards";
import { PLANNED_PLANS } from "./plans";

describe("PlanCards", () => {
  it("shows the free early-access plan and marks paid plans as coming soon", () => {
    render(<PlanCards />);
    expect(screen.getByText("Free during early access")).toBeInTheDocument();
    expect(screen.getByText("Coming soon")).toBeInTheDocument();
    for (const plan of PLANNED_PLANS) expect(screen.getByText(plan.name)).toBeInTheDocument();
  });

  it("never shows an invented price", () => {
    render(<PlanCards />);
    expect(screen.queryByText(/₱\s*\d/)).toBeNull();
    expect(screen.getAllByText("[YOUR PRICE]").length).toBe(PLANNED_PLANS.length);
  });
});
