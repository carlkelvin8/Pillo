import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const SECRET = "pillo_mcp_test_token_value";
vi.mock("../actions", () => ({
  createMcpTokenAction: vi.fn(async () => ({ ok: true, data: { token: SECRET } })),
  revokeMcpTokenAction: vi.fn(),
}));

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

describe("TokenManager token copy", () => {
  afterEach(() => vi.restoreAllMocks());

  async function createToken() {
    render(<TokenManager timezone="Asia/Manila" tokens={[]} />);
    fireEvent.change(screen.getByRole("textbox", { name: "Token name" }), {
      target: { value: "Reporting" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create token" }));
    return screen.findByRole("button", { name: "Copy token" });
  }

  it("copies the new token with the clipboard API", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    fireEvent.click(await createToken());
    expect(await screen.findByRole("button", { name: "Copied" })).toBeInTheDocument();
    expect(writeText).toHaveBeenCalledWith(SECRET);
  });

  it.each([
    ["navigator.clipboard is undefined", undefined],
    ["writeText is refused", { writeText: vi.fn().mockRejectedValue(new Error("denied")) }],
  ])("selects the token when %s", async (_label, clipboard) => {
    Object.defineProperty(navigator, "clipboard", { value: clipboard, configurable: true });
    fireEvent.click(await createToken());
    expect(await screen.findByText("Selected. Press Ctrl+C to copy.")).toBeInTheDocument();
    expect(document.activeElement).toBe(screen.getByLabelText("New MCP bearer token"));
  });
});
