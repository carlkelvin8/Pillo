import { describe, expect, it } from "vitest";
import { mapInvoice, mapPatient } from "./map";
import { parseInvoiceNumber, searchQuerySchema } from "./schema";

describe("searchQuerySchema", () => {
  it("requires two characters", () => {
    expect(searchQuerySchema.safeParse("a").success).toBe(false);
    expect(searchQuerySchema.safeParse(" ").success).toBe(false);
    expect(searchQuerySchema.parse("  Ana  ")).toBe("Ana");
  });
  it("strips filter and wildcard characters", () => {
    expect(searchQuerySchema.parse("a%,b_(c)")).toBe("a b c");
    expect(searchQuerySchema.safeParse("x".repeat(61)).success).toBe(false);
  });
});

describe("parseInvoiceNumber", () => {
  it("accepts INV forms and bare numbers", () => {
    expect(parseInvoiceNumber("INV-0012")).toBe(12);
    expect(parseInvoiceNumber("inv 7")).toBe(7);
    expect(parseInvoiceNumber("42")).toBe(42);
  });
  it("ignores names", () => {
    expect(parseInvoiceNumber("Maria")).toBeNull();
    expect(parseInvoiceNumber("INV-")).toBeNull();
  });
});

describe("result mapping", () => {
  it("maps a patient to a link with id and phone", () => {
    expect(
      mapPatient({ id: "p1", full_name: "Ana Cruz", patient_number: 7, phone: "0917" }),
    ).toEqual({
      group: "patients",
      id: "p1",
      title: "Ana Cruz",
      subtitle: "ID 00007 · 0917",
      href: "/patients/p1",
    });
  });
  it("maps an invoice with patient name, total and status", () => {
    const r = mapInvoice(
      { id: "i1", invoice_number: 12, status: "sent", total_centavos: 150000, patient_id: "p1" },
      "Ana Cruz",
    );
    expect(r.title).toBe("INV-0012");
    expect(r.href).toBe("/invoices/i1");
    expect(r.subtitle).toContain("Ana Cruz");
    expect(r.subtitle).toContain("Sent");
  });
});
