import { describe, expect, it } from "vitest";
import { bearerToken } from "./auth";

describe("MCP bearer authentication header", () => {
  it("accepts a well-formed bearer token without exposing other header values", () => {
    const token = "a".repeat(48);
    expect(bearerToken(`Bearer ${token}`)).toBe(token);
    expect(bearerToken(`bearer ${token}`)).toBe(token);
  });

  it("rejects missing, malformed, or oversized credentials", () => {
    expect(bearerToken(null)).toBeNull();
    expect(bearerToken("Basic abcdefghijklmnopqrstuvwxyz0123456789")).toBeNull();
    expect(bearerToken(`Bearer ${"x".repeat(129)}`)).toBeNull();
    expect(bearerToken("Bearer token with spaces")).toBeNull();
  });
});
