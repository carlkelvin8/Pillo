import { describe, expect, it } from "vitest";
import { getDemoVoiceLine } from "./voice-lines";

describe("getDemoVoiceLine", () => {
  it("returns only fixed fictional demo copy for known line IDs", () => {
    expect(getDemoVoiceLine("schedule")?.text).toContain("appointment request");
    expect(getDemoVoiceLine("intro")?.text).toContain("fictional examples only");
  });

  it("rejects free-form text and unknown IDs", () => {
    expect(getDemoVoiceLine("Patient Maria has an appointment" )).toBeNull();
    expect(getDemoVoiceLine("unknown")).toBeNull();
  });
});
