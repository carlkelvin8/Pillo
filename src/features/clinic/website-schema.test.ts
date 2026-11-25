import { describe, expect, it } from "vitest";
import { clinicProfileSchema } from "./schemas";

describe("clinic public link", () => {
  const clinic = { name: "Example clinic" };

  it("accepts a clinic website, including a Facebook page", () => {
    const websiteUrl = "https://www.facebook.com/exampleclinic";
    expect(clinicProfileSchema.parse({ ...clinic, websiteUrl }).websiteUrl).toBe(websiteUrl);
  });

  it("allows a saved link to be removed", () => {
    expect(clinicProfileSchema.parse({ ...clinic, websiteUrl: " " }).websiteUrl).toBeNull();
  });

  it.each(["javascript:alert(1)", "//example.com", "https://a:b@example.com"])(
    "rejects unsafe links (%s)",
    (websiteUrl) => {
      expect(clinicProfileSchema.safeParse({ ...clinic, websiteUrl }).success).toBe(false);
    },
  );
});
