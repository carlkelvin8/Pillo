import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { InvoiceRow, PaymentRow } from "@/features/invoices/schemas";
import * as invoiceQueries from "@/features/invoices/queries";
import InvoiceDetailPage from "./page";

vi.mock("@/features/auth/workspace", () => ({
  requireCapability: async () => ({
    membership: {
      clinic: { id: "clinic", name: "Clinic", address: "Main Street", timezone: "Asia/Manila" },
    },
  }),
}));
vi.mock("@/features/patients/queries", () => ({
  patientNames: async () => new Map([["patient", { name: "Example Patient", number: 1 }]]),
}));
vi.mock("@/features/invoices/queries", async (importOriginal) => ({
  ...(await importOriginal<typeof invoiceQueries>()),
  getInvoice: vi.fn(),
}));
vi.mock("@/features/invoices/actions", () => ({
  cancelPaymentLinkAction: vi.fn(),
  logInvoiceLinkSharedAction: vi.fn(),
  recordPaymentAction: vi.fn(),
  requestPaymentAction: vi.fn(),
  sendInvoiceAction: vi.fn(),
  updateDraftInvoiceAction: vi.fn(),
  voidInvoiceAction: vi.fn(),
}));

const id = "11111111-1111-4111-8111-111111111111";
const createdAt = "2026-11-25T02:30:00.000Z";
const paidAt = "2026-11-25T04:30:00.000Z";
const invoice: InvoiceRow = {
  id,
  invoice_number: 12345,
  patient_id: "patient",
  doctor_id: null,
  status: "draft",
  issued_on: "2026-11-25",
  due_on: "2026-12-02",
  note: null,
  subtotal_centavos: 100_000,
  discount_centavos: 0,
  tax_centavos: 0,
  total_centavos: 100_000,
  created_at: createdAt,
  sent_at: null,
  paid_at: null,
  voided_at: null,
};
const payment: PaymentRow = {
  id: "payment",
  invoice_id: id,
  method: "bank",
  amount_centavos: 25_000,
  status: "succeeded",
  provider: "manual",
  provider_ref: null,
  checkout_url: null,
  reference: "A".repeat(80),
  paid_at: paidAt,
  created_at: paidAt,
};

describe("InvoiceDetailPage", () => {
  it("groups invoice editing, payment collection and payment history by purpose", async () => {
    vi.mocked(invoiceQueries.getInvoice).mockResolvedValue({ invoice, items: [], payments: [] });
    render(await InvoiceDetailPage({ params: Promise.resolve({ id }) }));

    const details = within(screen.getByRole("region", { name: "Invoice details" }));
    const payment = within(screen.getByRole("region", { name: "Payment record" }));
    const timeline = within(screen.getByRole("region", { name: "Timeline" }));

    expect(details.getByText("Edit draft invoice")).toBeInTheDocument();
    expect(details.getByRole("link", { name: "Download PDF" })).toHaveAttribute(
      "href",
      `/api/invoices/${id}/pdf`,
    );
    expect(payment.queryByRole("button", { name: "Request payment" })).not.toBeInTheDocument();
    expect(payment.getByText("Online payments: coming soon")).toBeInTheDocument();
    expect(payment.getByRole("button", { name: "Record payment" })).toBeInTheDocument();
    expect(timeline.getByRole("listitem")).toHaveTextContent("Invoice created");
  });

  it("shows a payment receipt with its full reference and timeline timestamp", async () => {
    vi.mocked(invoiceQueries.getInvoice).mockResolvedValue({
      invoice: { ...invoice, status: "paid", paid_at: paidAt },
      items: [],
      payments: [{ ...payment, amount_centavos: 100_000 }],
    });
    render(await InvoiceDetailPage({ params: Promise.resolve({ id }) }));

    const paymentCard = within(screen.getByRole("region", { name: "Payment record" }));
    const receipt = within(paymentCard.getByRole("region", { name: "Payment receipt" }));
    const timeline = within(screen.getByRole("region", { name: "Timeline" }));
    expect(receipt.getByText("Paid in full")).toBeInTheDocument();
    expect(receipt.getByText(payment.reference!)).toBeInTheDocument();
    expect(paymentCard.queryByRole("button", { name: "Request payment" })).toBeNull();
    const events = timeline.getAllByRole("listitem");
    expect(events[1]).toHaveTextContent("Payment recorded · Bank transfer");
    expect(events[1]?.querySelector("time")).toHaveAttribute("datetime", paidAt);
  });
});
