import { describe, expect, it } from "vitest";
import { firstName, offerMessage } from "./message";

describe("offerMessage", () => {
  it("uses only the first name, the slot, the doctor and the link", () => {
    const m = offerMessage({
      fullName: "Maria Santos",
      clinicName: "Sample Dental",
      doctorName: "Dr. Reyes",
      slotLabel: "Thu January 14, 2:00 PM",
      link: "https://x.test/offer/abc",
    });
    expect(m).toContain("Hi Maria po!");
    expect(m).not.toContain("Santos");
    expect(m).toContain("Dr. Reyes");
    expect(m).toContain("https://x.test/offer/abc");
  });
  it("handles single names", () => {
    expect(firstName("  Juan  ")).toBe("Juan");
  });
});
