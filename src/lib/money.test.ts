import { describe, expect, it } from "vitest";
import { formatPHP, parsePesosToCentavos, splitPHP } from "./money";

describe("formatPHP", () => {
  it("formats centavos as pesos", () => {
    expect(formatPHP(125050)).toContain("1,250.50");
    expect(formatPHP(0)).toContain("0.00");
  });
  it("rejects non-integers", () => {
    expect(() => formatPHP(10.5)).toThrow(RangeError);
  });
});

describe("parsePesosToCentavos", () => {
  it("parses common inputs", () => {
    expect(parsePesosToCentavos("1,250.50")).toBe(125050);
    expect(parsePesosToCentavos("₱ 99")).toBe(9900);
    expect(parsePesosToCentavos("0.5")).toBe(50);
  });
  it("rejects garbage", () => {
    expect(parsePesosToCentavos("abc")).toBeNull();
    expect(parsePesosToCentavos("1.234")).toBeNull();
    expect(parsePesosToCentavos("-5")).toBeNull();
  });
});

describe("splitPHP", () => {
  it("separates whole pesos and centavos", () => {
    expect(splitPHP(48236050)).toEqual({ whole: "₱482,360", cents: ".50" });
    expect(splitPHP(0)).toEqual({ whole: "₱0", cents: ".00" });
  });
});
