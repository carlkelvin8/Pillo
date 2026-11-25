import { describe, expect, it } from "vitest";
import { renderInvoicePdf } from "./pdf";

describe("renderInvoicePdf", () => {
  it("returns an in-memory PDF document", async () => {
    const bytes = await renderInvoicePdf({ clinicName: "Test clinic", invoiceNumber: 12, patientName: "Synthetic Patient", status: "Draft", dueOn: "2026-12-01", items: [{ description: "Consultation", quantity: 1, unit_price_centavos: 10000, amount_centavos: 10000 }], subtotalCentavos: 10000, discountCentavos: 0, taxCentavos: 0, totalCentavos: 10000 });
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
  });
});
