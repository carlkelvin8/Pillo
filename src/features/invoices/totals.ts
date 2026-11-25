export type LineItem = { quantity: number; unitPriceCentavos: number };

export type Totals = { subtotal: number; discount: number; tax: number; total: number };

/**
 * Same arithmetic as the database (invoices_total_matches): the discount can never push the total
 * below zero, and tax is added after. All integers (centavos).
 */
export function computeTotals(
  items: LineItem[],
  discountCentavos: number,
  taxCentavos: number,
): Totals {
  const subtotal = items.reduce((sum, i) => sum + i.quantity * i.unitPriceCentavos, 0);
  const discount = Math.min(discountCentavos, subtotal);
  return { subtotal, discount, tax: taxCentavos, total: subtotal - discount + taxCentavos };
}

export type InvoiceDisplayStatus = "draft" | "pending" | "overdue" | "paid" | "void";

/** The stored status plus "overdue" (sent, unpaid and past its due date in clinic time). */
export function displayStatus(
  status: "draft" | "sent" | "paid" | "void",
  dueOn: string,
  today: string,
): InvoiceDisplayStatus {
  if (status === "sent") return dueOn < today ? "overdue" : "pending";
  return status;
}

export const STATUS_LABEL: Record<InvoiceDisplayStatus, string> = {
  draft: "Draft",
  pending: "Pending",
  overdue: "Overdue",
  paid: "Paid",
  void: "Void",
};

export const STATUS_TONE = {
  draft: "neutral",
  pending: "pending",
  overdue: "danger",
  paid: "success",
  void: "neutral",
} as const;

export function invoiceLabel(number: number): string {
  return `INV-${String(number).padStart(4, "0")}`;
}
