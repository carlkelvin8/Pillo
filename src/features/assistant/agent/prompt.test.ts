import { describe, expect, it } from "vitest";
import { assistantSettingsSchema } from "@/features/assistant/settings";
import { buildSystemPrompt } from "./prompt";
import type { ClinicInfo } from "./store";

const clinic = (over: Partial<ClinicInfo["settings"]> = {}): ClinicInfo => ({
  id: "c1",
  name: "Sample Dental",
  timezone: "Asia/Manila",
  address: null,
  phone: null,
  settings: assistantSettingsSchema.parse(over),
});

describe("buildSystemPrompt", () => {
  it("names the clinic and the assistant, and carries the medical and refund rules", () => {
    const p = buildSystemPrompt(clinic(), "Tuesday 24 November 2026, 10:00 AM");
    expect(p).toContain("Sample Dental");
    expect(p).toContain("Dr. Pill");
    expect(p).toMatch(/NOT a doctor/);
    expect(p).toMatch(/request_human/);
    expect(p).toMatch(/refund/i);
    expect(p).toMatch(/untrusted/);
    expect(p.endsWith("Tuesday 24 November 2026, 10:00 AM")).toBe(true);
  });
  it("follows the clinic's tone", () => {
    expect(buildSystemPrompt(clinic({ tone: "professional" }), "now")).toMatch(/Professional/);
    expect(buildSystemPrompt(clinic({ tone: "playful" }), "now")).toMatch(/Playful/);
  });
  it("states what the clinic has turned off", () => {
    const p = buildSystemPrompt(
      clinic({ answer_questions: false, book_appointments: false }),
      "now",
    );
    expect(p).toMatch(/Turned off by this clinic/);
    expect(p).toMatch(/may NOT answer/);
    expect(p).toMatch(/may NOT book/);
    expect(buildSystemPrompt(clinic(), "now")).not.toMatch(/Turned off/);
  });
});
