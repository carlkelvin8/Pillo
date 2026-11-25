import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AppShellFrame } from "./app-shell-frame";

describe("AppShellFrame", () => {
  it("toggles the desktop sidebar between full and compact widths accessibly", () => {
    render(
      <AppShellFrame
        role="owner"
        sidebarHeader={<span>Pillo</span>}
        sidebarBody={<a href="/dashboard">Dashboard</a>}
      >
        <h1>Dashboard page</h1>
      </AppShellFrame>,
    );

    const shell = screen.getByTestId("app-shell");
    const toggle = screen.getByRole("button", { name: "Toggle sidebar width" });
    const sidebar = screen.getByRole("complementary", { name: "Primary sidebar" });
    expect(sidebar).toHaveClass("bg-surface");
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(toggle).toHaveAttribute("aria-controls", "app-sidebar");

    fireEvent.click(toggle);

    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(shell).toHaveAttribute("data-sidebar-collapsed", "true");
    expect(sidebar).toHaveStyle({ width: "72px" });
    expect(screen.getByRole("link", { name: "Dashboard" })).toBeInTheDocument();
  });
});
