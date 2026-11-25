import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import {
  invoiceRowSchema,
  itemRowSchema,
  paymentRowSchema,
  type InvoiceRow,
  type PaymentRow,
} from "./schemas";

const INVOICE_COLUMNS =
  "id, invoice_number, patient_id, doctor_id, status, issued_on, due_on, note, subtotal_centavos, discount_centavos, tax_centavos, total_centavos, created_at, sent_at, paid_at, voided_at";
export const INVOICE_PAGE_SIZE = 20;

function check(error: { code?: string } | null, what: string): void {
  if (error) throw new Error(`Could not load ${what} (${error.code ?? "error"})`);
}

export type InvoiceFilter = "all" | "open" | "overdue" | "paid";

export async function listInvoices(args: {
  clinicId: string;
  filter: InvoiceFilter;
  today: string;
  page: number;
}) {
  const supabase = await createClient();
  const from = (args.page - 1) * INVOICE_PAGE_SIZE;
  let q = supabase
    .from("invoices")
    .select(INVOICE_COLUMNS, { count: "exact" })
    .eq("clinic_id", args.clinicId)
    .order("invoice_number", { ascending: false })
    .range(from, from + INVOICE_PAGE_SIZE - 1);
  if (args.filter === "open") q = q.eq("status", "sent");
  if (args.filter === "overdue") q = q.eq("status", "sent").lt("due_on", args.today);
  if (args.filter === "paid") q = q.eq("status", "paid");
  const { data, count, error } = await q;
  check(error, "invoices");
  return { rows: z.array(invoiceRowSchema).parse(data ?? []), total: count ?? 0 };
}

/** Open (sent, unpaid), overdue and paid-this-month totals. */
export async function invoiceStats(clinicId: string, today: string, monthStartIso: string) {
  const supabase = await createClient();
  const [open, paid] = await Promise.all([
    supabase
      .from("invoices")
      .select("total_centavos, due_on")
      .eq("clinic_id", clinicId)
      .eq("status", "sent"),
    supabase
      .from("invoices")
      .select("total_centavos")
      .eq("clinic_id", clinicId)
      .eq("status", "paid")
      .gte("paid_at", monthStartIso),
  ]);
  check(open.error, "invoice totals");
  check(paid.error, "invoice totals");
  const openRows = z
    .array(z.object({ total_centavos: z.coerce.number(), due_on: z.string() }))
    .parse(open.data ?? []);
  const paidRows = z.array(z.object({ total_centavos: z.coerce.number() })).parse(paid.data ?? []);
  const overdue = openRows.filter((r) => r.due_on < today);
  const sum = (rows: { total_centavos: number }[]) =>
    rows.reduce((a, r) => a + r.total_centavos, 0);
  return {
    open: { centavos: sum(openRows), count: openRows.length },
    overdue: { centavos: sum(overdue), count: overdue.length },
    paidThisMonth: { centavos: sum(paidRows), count: paidRows.length },
  };
}

export async function getInvoice(clinicId: string, id: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("invoices")
    .select(INVOICE_COLUMNS)
    .eq("clinic_id", clinicId)
    .eq("id", id)
    .maybeSingle();
  check(error, "invoice");
  if (!data) return null;
  const invoice = invoiceRowSchema.parse(data);
  const [items, payments] = await Promise.all([
    supabase
      .from("invoice_items")
      .select("id, position, description, quantity, unit_price_centavos, amount_centavos")
      .eq("invoice_id", id)
      .order("position"),
    supabase
      .from("payments")
      .select(
        "id, invoice_id, method, amount_centavos, status, provider, provider_ref, checkout_url, reference, paid_at, created_at",
      )
      .eq("invoice_id", id)
      .order("created_at", { ascending: true }),
  ]);
  check(items.error, "invoice items");
  check(payments.error, "payments");
  return {
    invoice,
    items: z.array(itemRowSchema).parse(items.data ?? []),
    payments: z.array(paymentRowSchema).parse(payments.data ?? []),
  };
}

export async function patientBilling(clinicId: string, patientId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("invoices")
    .select(INVOICE_COLUMNS)
    .eq("clinic_id", clinicId)
    .eq("patient_id", patientId)
    .neq("status", "void")
    .order("created_at", { ascending: false });
  check(error, "patient invoices");
  const invoices = z.array(invoiceRowSchema).parse(data ?? []);
  if (!invoices.length) return { invoices, payments: [], outstandingCentavos: 0 };
  const { data: paymentData, error: paymentError } = await supabase
    .from("payments")
    .select(
      "id, invoice_id, method, amount_centavos, status, provider, provider_ref, checkout_url, reference, paid_at, created_at",
    )
    .in(
      "invoice_id",
      invoices.map((invoice) => invoice.id),
    )
    .order("created_at", { ascending: false });
  check(paymentError, "patient payment history");
  const payments = z.array(paymentRowSchema).parse(paymentData ?? []);
  const paidByInvoice = new Map<string, number>();
  for (const payment of payments)
    if (payment.status === "succeeded")
      paidByInvoice.set(
        payment.invoice_id,
        (paidByInvoice.get(payment.invoice_id) ?? 0) + payment.amount_centavos,
      );
  const outstandingCentavos = invoices
    .filter((invoice) => invoice.status === "sent")
    .reduce(
      (sum, invoice) =>
        sum + Math.max(0, invoice.total_centavos - (paidByInvoice.get(invoice.id) ?? 0)),
      0,
    );
  return { invoices, payments, outstandingCentavos };
}

export function amountPaid(payments: PaymentRow[]): number {
  return payments
    .filter((p) => p.status === "succeeded")
    .reduce((a, p) => a + p.amount_centavos, 0);
}

export type { InvoiceRow };
