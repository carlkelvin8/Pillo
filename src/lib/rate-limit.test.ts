import { beforeEach, describe, expect, it } from "vitest";
import { rateLimit, resetRateLimits } from "./rate-limit";

describe("rateLimit", () => {
  beforeEach(resetRateLimits);
  it("allows up to the limit then blocks, per key", () => {
    for (let i = 0; i < 3; i++) expect(rateLimit("a", 3, 1000, 0)).toBe(true);
    expect(rateLimit("a", 3, 1000, 10)).toBe(false);
    expect(rateLimit("b", 3, 1000, 10)).toBe(true);
  });
  it("resets after the window", () => {
    for (let i = 0; i < 4; i++) rateLimit("a", 3, 1000, 0);
    expect(rateLimit("a", 3, 1000, 1001)).toBe(true);
  });
});
