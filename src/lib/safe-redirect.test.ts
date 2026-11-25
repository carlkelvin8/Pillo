import { describe, expect, it } from "vitest";
import { safeNext } from "./safe-redirect";

describe("safeNext", () => {
  it("allows same-site paths", () => {
    expect(safeNext("/dashboard")).toBe("/dashboard");
    expect(safeNext("/patients?q=juan")).toBe("/patients?q=juan");
  });
  it.each([
    "https://evil.test",
    "//evil.test",
    "/\\evil.test",
    "javascript:alert(1)",
    "dashboard",
    "",
    "/a\nb",
  ])("rejects %j", (value) => {
    expect(safeNext(value)).toBeNull();
  });
  it("rejects non-strings", () => {
    expect(safeNext(null)).toBeNull();
    expect(safeNext(42)).toBeNull();
  });
});
