import { afterEach, describe, expect, it, vi } from "vitest";
import { patientFormSchema } from "./schemas";

const base = { fullName: "Ana Cruz", birthdate: "", sex: "", phone: "", email: "", consent: false };

describe("patientFormSchema messages", () => {
  it("explains an over-long name in plain words", () => {
    const r = patientFormSchema.safeParse({ ...base, fullName: "X".repeat(121) });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.message).toBe("Keep the name to 120 characters or fewer.");
  });
  it("explains an over-long phone number in plain words", () => {
    const r = patientFormSchema.safeParse({ ...base, phone: "9".repeat(41) });
    expect(r.error?.issues[0]?.message).toBe("Keep this to 40 characters or fewer.");
  });
  it("rejects a future birthdate and accepts an empty one", () => {
    expect(patientFormSchema.safeParse({ ...base, birthdate: "2999-01-01" }).success).toBe(false);
    expect(patientFormSchema.safeParse(base).success).toBe(true);
  });
});

describe("birthdate uses Manila time", () => {
  afterEach(() => vi.useRealTimers());
  it("accepts today in Manila even while it is still yesterday in UTC", () => {
    // 2027-03-10 02:00 in Manila = 2027-03-09 18:00 UTC
    vi.useFakeTimers({ now: new Date("2027-03-09T18:00:00Z") });
    expect(patientFormSchema.safeParse({ ...base, birthdate: "2027-03-10" }).success).toBe(true);
    expect(patientFormSchema.safeParse({ ...base, birthdate: "2027-03-11" }).success).toBe(false);
  });
});
