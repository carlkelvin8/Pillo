import { describe, expect, it } from "vitest";
import { ageOn, patientIdLabel, sanitizeSearch } from "./age";

describe("ageOn", () => {
  it("counts whole years and handles birthdays not yet reached", () => {
    expect(ageOn("1992-11-25", "2026-11-24")).toBe(33);
    expect(ageOn("1992-11-24", "2026-11-24")).toBe(34);
    expect(ageOn("2000-02-29", "2027-02-28")).toBe(26);
  });
});

describe("sanitizeSearch", () => {
  it("strips characters that could alter a PostgREST filter", () => {
    expect(sanitizeSearch("juan,(full_name.eq.x)%*")).toBe("juanfullname.eq.x");
    expect(sanitizeSearch("  Maria  dela Cruz ")).toBe("Maria  dela Cruz");
    expect(sanitizeSearch("0917-123 4567")).toBe("0917-123 4567");
  });
  it("caps the length", () => {
    expect(sanitizeSearch("a".repeat(200))).toHaveLength(60);
  });
});

describe("patientIdLabel", () => {
  it("zero-pads like the design (ID 00482)", () => {
    expect(patientIdLabel(482)).toBe("00482");
  });
});
