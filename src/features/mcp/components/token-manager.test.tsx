import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("../actions", () => ({ createMcpTokenAction: vi.fn(), revokeMcpTokenAction: vi.fn() }));

import { TokenManager } from "./token-manager";

const base = {
  scopes: ["appointments:read"],
  created_at: "2026-01-01T00:00:00Z",
  last_used_at: null,
  revoked_at: null,
};

describe("TokenManager token states", () => {
  it("shows Expired on an expired token, still lets it be revoked, and shows Revoked for revoked ones", () => {
    render(
      <TokenManager
        timezone="Asia/Manila"
        tokens={[
          { ...base, id: "a", name: "Active one", expires_at: "2099-01-01T00:00:00Z" },
          { ...base, id: "b", name: "Old one", expires_at: "2026-02-01T00:00:00Z" },
          {
            ...base,
            id: "c",
            name: "Gone one",
            expires_at: "2099-01-01T00:00:00Z",
            revoked_at: "2026-03-01T00:00:00Z",
          },
        ]}
      />,
    );
    const row = (name: string) => screen.getByText(name).closest("li")!;
    expect(within(row("Old one")).getByText("Expired", { selector: "span" })).toBeInTheDocument();
    expect(within(row("Old one")).getByRole("button", { name: "Revoke" })).toBeInTheDocument();
    expect(within(row("Active one")).queryByText("Expired", { selector: "span" })).toBeNull();
    expect(within(row("Gone one")).getByText("Revoked")).toBeInTheDocument();
    expect(within(row("Gone one")).queryByRole("button", { name: "Revoke" })).toBeNull();
  });
});
