import { describe, expect, it } from "vitest";
import { expiryFromChoice, MCP_EXPIRY_DAYS, tokenState } from "./expiry";

describe("MCP token expiry", () => {
  const now = new Date("2026-11-26T00:00:00Z");
  it("offers only short lifetimes", () => {
    expect(MCP_EXPIRY_DAYS).toEqual([30, 90, 365]);
  });
  it("computes the expiry from the chosen number of days", () => {
    expect(expiryFromChoice(30, now).toISOString()).toBe("2026-12-26T00:00:00.000Z");
  });
  it("classifies tokens as active, expired or revoked", () => {
    expect(tokenState({ revoked_at: null, expires_at: "2026-12-01T00:00:00Z" }, now)).toBe(
      "active",
    );
    expect(tokenState({ revoked_at: null, expires_at: "2026-11-25T00:00:00Z" }, now)).toBe(
      "expired",
    );
    expect(
      tokenState({ revoked_at: "2026-11-01T00:00:00Z", expires_at: "2027-01-01T00:00:00Z" }, now),
    ).toBe("revoked");
  });
});
