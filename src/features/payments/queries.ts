import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { dateOf } from "@/lib/datetime";

function check(error: { code?: string; message?: string } | null, what: string): void {
  if (error) throw new Error(`Could not load ${what} (${error.code ?? "error"})`);
}

/** Available balance in centavos. Only owner and billing may ask (enforced in the database). */
export async function getBalance(clinicId: string): Promise<number> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("clinic_balance", { p_clinic_id: clinicId });
  check(error, "balance");
  return Number(data ?? 0);
}

const paymentRow = z.object({
  id: z.string(),
  invoice_id: z.string(),
  method: z.enum(["gcash", "maya", "card", "cash", "bank"]).nullable(),
  amount_centavos: z.coerce.number(),
  status: z.enum(["pending", "succeeded", "failed", "cancelled"]),
  provider: z.enum(["manual", "paymongo", "mock"]),
  paid_at: z.string().nullable(),
  created_at: z.string(),
});
const payoutRow = z.object({
  id: z.string(),
  amount_centavos: z.coerce.number(),
  destination: z.string(),
  status: z.enum(["processing", "paid", "cancelled"]),
  arrives_on: z.string(),
  is_mock: z.boolean(),
  created_at: z.string(),
});
export type PayoutRow = z.infer<typeof payoutRow>;

export type Transaction = {
  id: string;
  kind: "incoming" | "outgoing";
  title: string;
  subtitle: string;
  status: "paid" | "pending" | "processing" | "completed";
  centavos: number;
  at: string;
  invoiceId?: string;
};

const METHOD_LABEL = {
  gcash: "GCash",
  maya: "Maya",
  card: "Card",
  cash: "Cash",
  bank: "Bank transfer",
} as const;
export const methodLabel = (m: keyof typeof METHOD_LABEL | null) =>
  m ? METHOD_LABEL[m] : "Awaiting payment";

/** Latest incoming payments and outgoing payouts, newest first. */
export async function listTransactions(
  clinicId: string,
  limit = 30,
): Promise<{ items: Transaction[]; payouts: PayoutRow[] }> {
  const supabase = await createClient();
  const [pay, out] = await Promise.all([
    supabase
      .from("payments")
      .select("id, invoice_id, method, amount_centavos, status, provider, paid_at, created_at")
      .eq("clinic_id", clinicId)
      .in("status", ["succeeded", "pending"])
      .order("created_at", { ascending: false })
      .limit(limit),
    supabase
      .from("payouts")
      .select("id, amount_centavos, destination, status, arrives_on, is_mock, created_at")
      .eq("clinic_id", clinicId)
      .neq("status", "cancelled")
      .order("created_at", { ascending: false })
      .limit(limit),
  ]);
  check(pay.error, "payments");
  check(out.error, "payouts");
  const payments = z.array(paymentRow).parse(pay.data ?? []);
  const payouts = z.array(payoutRow).parse(out.data ?? []);

  const invoiceIds = [...new Set(payments.map((p) => p.invoice_id))];
  const invoiceInfo = new Map<string, { number: number; patientId: string }>();
  const patientName = new Map<string, string>();
  if (invoiceIds.length > 0) {
    const { data, error } = await supabase
      .from("invoices")
      .select("id, invoice_number, patient_id")
      .eq("clinic_id", clinicId)
      .in("id", invoiceIds);
    check(error, "invoices");
    for (const r of z
      .array(z.object({ id: z.string(), invoice_number: z.number(), patient_id: z.string() }))
      .parse(data ?? []))
      invoiceInfo.set(r.id, { number: r.invoice_number, patientId: r.patient_id });
    const { data: pats, error: pe } = await supabase
      .from("patients")
      .select("id, full_name")
      .eq("clinic_id", clinicId)
      .in("id", [...new Set([...invoiceInfo.values()].map((v) => v.patientId))]);
    check(pe, "patients");
    for (const r of z.array(z.object({ id: z.string(), full_name: z.string() })).parse(pats ?? []))
      patientName.set(r.id, r.full_name);
  }

  const items: Transaction[] = [
    ...payments.map((p): Transaction => {
      const inv = invoiceInfo.get(p.invoice_id);
      return {
        id: p.id,
        kind: "incoming",
        title: (inv && patientName.get(inv.patientId)) ?? "Patient",
        subtitle: `INV-${String(inv?.number ?? 0).padStart(4, "0")} · ${methodLabel(p.method)}`,
        status: p.status === "succeeded" ? "paid" : "pending",
        centavos: p.amount_centavos,
        at: p.paid_at ?? p.created_at,
        invoiceId: p.invoice_id,
      };
    }),
    ...payouts.map((p): Transaction => ({
      id: p.id,
      kind: "outgoing",
      title: `Payout to ${p.destination}`,
      subtitle: p.is_mock ? "Demo payout" : "Payout",
      status: p.status === "processing" ? "processing" : "completed",
      centavos: -p.amount_centavos,
      at: p.created_at,
    })),
  ];
  items.sort((a, b) => b.at.localeCompare(a.at));
  return { items: items.slice(0, limit), payouts };
}

/** Succeeded payments in the last ~12 months, for the collections chart and the payment-method mix. */
export async function collectionsData(clinicId: string, sinceIso: string, tz: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("payments")
    .select("method, amount_centavos, paid_at")
    .eq("clinic_id", clinicId)
    .eq("status", "succeeded")
    .gte("paid_at", sinceIso)
    .order("paid_at", { ascending: true })
    .limit(5000);
  check(error, "collections");
  const rows = z
    .array(
      z.object({
        method: z.enum(["gcash", "maya", "card", "cash", "bank"]),
        amount_centavos: z.coerce.number(),
        paid_at: z.string(),
      }),
    )
    .parse(data ?? []);
  const byMonth = new Map<string, number>();
  const byMethod = new Map<string, number>();
  for (const r of rows) {
    const month = dateOf(r.paid_at, tz).slice(0, 7);
    byMonth.set(month, (byMonth.get(month) ?? 0) + r.amount_centavos);
    byMethod.set(r.method, (byMethod.get(r.method) ?? 0) + r.amount_centavos);
  }
  return { rows, byMonth, byMethod };
}

/** Sum of amounts and count for succeeded payments on one clinic-local day. */
export function sumOnDay(
  rows: { amount_centavos: number; paid_at: string }[],
  day: string,
  tz: string,
) {
  const today = rows.filter((r) => dateOf(r.paid_at, tz) === day);
  return { centavos: today.reduce((a, r) => a + r.amount_centavos, 0), count: today.length };
}
