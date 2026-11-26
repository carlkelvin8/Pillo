import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/dashboard",
}));
import { AppShellFrame } from "./app-shell-frame";

describe("AppShellFrame", () => {
  beforeEach(() => window.localStorage.clear());

  it("remembers the compact sidebar after a reload", () => {
    const frame = (
      <AppShellFrame role="owner" sidebarHeader={<span>Pillo</span>} sidebarBody={<span>Nav</span>}>
        <h1>Page</h1>
      </AppShellFrame>
    );
    const first = render(frame);
    fireEvent.click(screen.getByRole("button", { name: "Toggle sidebar width" }));
    expect(window.localStorage.getItem("pillo.sidebar")).toBe("compact");
    first.unmount();

    render(frame);
    expect(screen.getByTestId("app-shell")).toHaveAttribute("data-sidebar-collapsed", "true");
  });

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
