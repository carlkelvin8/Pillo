import { describe, expect, it } from "vitest";
import { recordPaymentSchema } from "./schemas";

const base = { invoiceId: "7b0f6f3e-3a52-4f4d-9a63-6a8f3f0f1c11", amount: "1,500.00" };

describe("recordPaymentSchema", () => {
  it.each(["cash", "bank", "gcash", "maya"])("accepts %s", (method) => {
    const r = recordPaymentSchema.safeParse({ ...base, method, receivedOn: "" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.amount).toBe(150000);
  });

  it("rejects card and unknown methods", () => {
    expect(recordPaymentSchema.safeParse({ ...base, method: "card" }).success).toBe(false);
    expect(recordPaymentSchema.safeParse({ ...base, method: "crypto" }).success).toBe(false);
  });

  it("treats a blank date as today (undefined) and keeps a valid one", () => {
    const blank = recordPaymentSchema.parse({ ...base, method: "cash", receivedOn: "  " });
    expect(blank.receivedOn).toBeUndefined();
    const dated = recordPaymentSchema.parse({ ...base, method: "cash", receivedOn: "2026-11-20" });
    expect(dated.receivedOn).toBe("2026-11-20");
  });

  it("rejects malformed dates", () => {
    for (const receivedOn of ["20-11-2026", "yesterday", "2026-1-1", "2026-02-31"]) {
      expect(recordPaymentSchema.safeParse({ ...base, method: "cash", receivedOn }).success).toBe(
        false,
      );
    }
  });

  it("rejects zero or invalid amounts", () => {
    expect(recordPaymentSchema.safeParse({ ...base, method: "cash", amount: "0" }).success).toBe(false);
    expect(recordPaymentSchema.safeParse({ ...base, method: "cash", amount: "abc" }).success).toBe(false);
  });
});
