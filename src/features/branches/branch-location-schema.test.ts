import { describe, expect, it } from "vitest";
import { branchFormSchema } from "./schemas";

describe("branch location fields", () => {
  const fields = { name: "Main branch" };

  it("preserves zero coordinates and rounds to the stored precision", () => {
    expect(
      branchFormSchema.parse({ ...fields, latitude: "0", longitude: "120.9812399" }),
    ).toMatchObject({ latitude: 0, longitude: 120.98124 });
  });

  it("accepts a branch without a pin", () => {
    expect(branchFormSchema.parse({ ...fields, latitude: " ", longitude: "" })).toMatchObject({
      latitude: null,
      longitude: null,
    });
  });

  it.each([
    { latitude: "14.5", longitude: "" },
    { latitude: "", longitude: "120.5" },
    { latitude: "90.000001", longitude: "120.5" },
    { latitude: "14.5", longitude: "-180.000001" },
    { latitude: "0xa", longitude: "120.5" },
  ])("rejects incomplete or invalid pins (%j)", (pin) => {
    expect(branchFormSchema.safeParse({ ...fields, ...pin }).success).toBe(false);
  });
});
