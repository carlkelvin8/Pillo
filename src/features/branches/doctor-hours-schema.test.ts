import { describe, expect, it } from "vitest";
import { doctorHoursFormSchema } from "./schemas";

const valid = {
  doctorId: "11111111-1111-4111-8111-111111111111",
  branchId: "22222222-2222-4222-8222-222222222222",
  weekday: "1",
  startsAt: "09:00",
  endsAt: "12:00",
  windowId: "",
};

describe("doctorHoursFormSchema", () => {
  it("accepts a window that ends after it starts", () => {
    expect(doctorHoursFormSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects zero-length or reversed windows", () => {
    expect(doctorHoursFormSchema.safeParse({ ...valid, endsAt: "09:00" }).success).toBe(false);
    expect(doctorHoursFormSchema.safeParse({ ...valid, startsAt: "13:00" }).success).toBe(false);
  });
});
