import { describe, expect, it } from "vitest";
import { initials } from "./initials";

describe("initials", () => {
  it("uses first and last name", () => {
    expect(initials("Maria Santos")).toBe("MS");
    expect(initials("Juan Pablo dela Cruz")).toBe("JC");
  });
  it("handles single names and emails", () => {
    expect(initials("Reyes")).toBe("R");
    expect(initials("jenny.ramos@clinic.ph")).toBe("JR");
  });
  it("handles empty input", () => {
    expect(initials("")).toBe("");
  });
});
