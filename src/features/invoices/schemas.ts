import { z } from "zod";
import { isDateString } from "@/lib/datetime";
import { parsePesosToCentavos } from "@/lib/money";
import { computeTotals } from "./totals";

const MAX_CENTAVOS = 100_000_000; // ₱1,000,000 per line: a sanity cap, not a business rule

const pesos = (label: string) =>
  z
    .string()
    .trim()
    .transform((v, ctx) => {
      if (v === "") return 0;
      const c = parsePesosToCentavos(v);
      if (c === null || c > MAX_CENTAVOS) {
        ctx.addIssue({ code: "custom", message: `${label}: enter an amount like 1,500.00.` });
        return z.NEVER;
      }
      return c;
    });

const dateField = (label: string) => z.string().refine(isDateString, `${label}: choose a date.`);

export const invoiceItemSchema = z.object({
  description: z.string().trim().min(1, "Describe every item.").max(200),
  quantity: z.coerce
    .number()
    .int("Quantity must be a whole number.")
    .min(1, "Quantity must be at least 1.")
    .max(1000),
  price: pesos("Price"),
});

export const invoiceFormSchema = z
  .object({
    patientId: z.uuid("Choose a patient."),
    doctorId: z.uuid().optional(),
    branchId: z.uuid().optional(),
    issuedOn: dateField("Invoice date"),
    dueOn: dateField("Due date"),
    note: z
      .string()
      .trim()
      .max(500)
      .transform((v) => (v === "" ? undefined : v))
      .optional(),
    discount: pesos("Discount"),
    tax: pesos("Tax"),
    items: z.array(invoiceItemSchema).min(1, "Add at least one item.").max(50),
    sendNow: z.boolean(),
  })
  .superRefine((v, ctx) => {
    if (v.dueOn < v.issuedOn)
      ctx.addIssue({
        code: "custom",
        path: ["dueOn"],
        message: "Due date cannot be before the invoice date.",
      });
    const subtotal = computeTotals(
      v.items.map((i) => ({ quantity: i.quantity, unitPriceCentavos: i.price })),
      0,
      0,
    ).subtotal;
    if (v.discount > subtotal)
      ctx.addIssue({
        code: "custom",
        path: ["discount"],
        message: "Discount cannot be more than the subtotal.",
      });
  });

export const recordPaymentSchema = z.object({
  invoiceId: z.uuid(),
  method: z.enum(["cash", "bank", "gcash", "maya"]),
  amount: pesos("Amount").refine((c) => c > 0, "Enter the amount received."),
  /** Clinic-local "YYYY-MM-DD" the money was received; blank means today. */
  receivedOn: z
    .string()
    .trim()
    .transform((v) => (v === "" ? undefined : v))
    .refine((v) => v === undefined || /^\d{4}-\d{2}-\d{2}$/.test(v), "Pick a valid date.")
    .optional(),
  reference: z
    .string()
    .trim()
    .max(80)
    .transform((v) => (v === "" ? undefined : v))
    .optional(),
});

export const invoiceIdSchema = z.object({ invoiceId: z.uuid() });

/* ---- database rows ---- */
export const invoiceRowSchema = z.object({
  id: z.uuid(),
  invoice_number: z.number().int(),
  patient_id: z.uuid(),
  doctor_id: z.uuid().nullable(),
  status: z.enum(["draft", "sent", "paid", "void"]),
  issued_on: z.string(),
  due_on: z.string(),
  note: z.string().nullable(),
  subtotal_centavos: z.coerce.number(),
  discount_centavos: z.coerce.number(),
  tax_centavos: z.coerce.number(),
  total_centavos: z.coerce.number(),
  created_at: z.string(),
  sent_at: z.string().nullable(),
  paid_at: z.string().nullable(),
  voided_at: z.string().nullable(),
});
export type InvoiceRow = z.infer<typeof invoiceRowSchema>;

export const itemRowSchema = z.object({
  id: z.uuid(),
  position: z.number().int(),
  description: z.string(),
  quantity: z.number().int(),
  unit_price_centavos: z.coerce.number(),
  amount_centavos: z.coerce.number(),
});

export const paymentRowSchema = z.object({
  id: z.uuid(),
  invoice_id: z.uuid(),
  method: z.enum(["gcash", "maya", "card", "cash", "bank"]).nullable(),
  amount_centavos: z.coerce.number(),
  status: z.enum(["pending", "succeeded", "failed", "cancelled"]),
  provider: z.enum(["manual", "paymongo", "mock"]),
  provider_ref: z.string().nullable(),
  checkout_url: z.string().nullable(),
  reference: z.string().nullable(),
  paid_at: z.string().nullable(),
  created_at: z.string(),
});
export type PaymentRow = z.infer<typeof paymentRowSchema>;
