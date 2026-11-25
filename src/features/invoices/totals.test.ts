import { describe, expect, it } from "vitest";
import { computeTotals, displayStatus, invoiceLabel } from "./totals";

describe("computeTotals", () => {
  it("matches the design example (consultation + vaccination + certificate = ₱2,450)", () => {
    const t = computeTotals(
      [
        { quantity: 1, unitPriceCentavos: 150000 },
        { quantity: 1, unitPriceCentavos: 85000 },
        { quantity: 1, unitPriceCentavos: 10000 },
      ],
      0,
      0,
    );
    expect(t).toEqual({ subtotal: 245000, discount: 0, tax: 0, total: 245000 });
  });
  it("multiplies quantity and applies discount then tax", () => {
    expect(computeTotals([{ quantity: 3, unitPriceCentavos: 10000 }], 5000, 2000)).toEqual({
      subtotal: 30000,
      discount: 5000,
      tax: 2000,
      total: 27000,
    });
  });
  it("caps the discount at the subtotal", () => {
    expect(computeTotals([{ quantity: 1, unitPriceCentavos: 1000 }], 999999, 0).total).toBe(0);
  });
  it("never produces fractions (integers in, integers out)", () => {
    expect(
      Number.isInteger(computeTotals([{ quantity: 7, unitPriceCentavos: 3333 }], 1, 1).total),
    ).toBe(true);
  });
});

describe("displayStatus", () => {
  it("marks sent invoices past their due date as overdue", () => {
    expect(displayStatus("sent", "2027-01-10", "2027-01-11")).toBe("overdue");
    expect(displayStatus("sent", "2027-01-10", "2027-01-10")).toBe("pending");
  });
  it("leaves other statuses alone", () => {
    expect(displayStatus("paid", "2020-01-01", "2027-01-01")).toBe("paid");
    expect(displayStatus("draft", "2020-01-01", "2027-01-01")).toBe("draft");
  });
});

describe("invoiceLabel", () => {
  it("zero-pads", () => expect(invoiceLabel(41)).toBe("INV-0041"));
});
