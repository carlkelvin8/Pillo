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
    expect(screen.getByText("GCash")).toBeInTheDocument();
  });
});
