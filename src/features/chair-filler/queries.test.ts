import { describe, expect, it } from "vitest";
import { estimateRecovered } from "./queries";

describe("estimateRecovered", () => {
  it("is kept visits times the owner's typical value, in centavos", () => {
    expect(estimateRecovered(3, 150_000)).toBe(450_000);
    expect(estimateRecovered(0, 150_000)).toBe(0);
  });
  it("is hidden (null) until the owner sets a value", () => {
    expect(estimateRecovered(3, null)).toBeNull();
  });
});
