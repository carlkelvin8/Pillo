import { describe, expect, it } from "vitest";
import { detectEmergency } from "./emergency";

describe("detectEmergency", () => {
  it.each([
    "I have chest pain",
    "He can't breathe",
    "hirap huminga po ako",
    "masakit ang dibdib ko",
    "nawalan ng malay yung lola ko",
    "my son had a seizure",
    "gusto kong mamatay",
    "this is an EMERGENCY",
    "dumudugo siya at hindi humihinto",
    "I want to die",
    "i wanna die",
    "bleeding will not stop",
    "the bleeding won't stop",
    "bleeding and it can't stop",
  ])("flags %j", (text) => {
    expect(detectEmergency(text)).toBe(true);
  });

  it.each([
    "Magkano po ang cleaning?",
    "Can I book on Friday at 3pm?",
    "Open po ba kayo bukas?",
    "I want to reschedule",
    "I want to diet before my braces",
    "bleeding gums, not sure when to stop brushing",
    "",
  ])("does not flag %j", (text) => {
    expect(detectEmergency(text)).toBe(false);
  });
});
