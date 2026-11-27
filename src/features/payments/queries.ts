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
export type Transaction = {
  id: string;
  title: string;
  subtitle: string;
  status: "paid" | "pending";
  centavos: number;
  at: string;
  invoiceId?: string;
};

export const TRANSACTION_PAGE_SIZE = 10;
export type TransactionFilter = "all" | "pending";

const METHOD_LABEL = {
  gcash: "GCash",
  maya: "Maya",
  card: "Card",
  cash: "Cash",
  bank: "Bank transfer",
} as const;
export const methodLabel = (m: keyof typeof METHOD_LABEL | null) =>
  m ? METHOD_LABEL[m] : "Awaiting payment";

/** Latest incoming payments, newest first. */
export async function listTransactions(
  clinicId: string,
  limitOrPage: number | { page: number; filter: TransactionFilter } = 30,
): Promise<{ items: Transaction[]; total: number }> {
  const supabase = await createClient();
  const paginated = typeof limitOrPage !== "number";
  const page = paginated ? Math.max(1, limitOrPage.page) : 1;
  const filter = paginated ? limitOrPage.filter : "all";
  let query = supabase
    .from("payments")
    .select("id, invoice_id, method, amount_centavos, status, provider, paid_at, created_at", {
      count: paginated ? "exact" : undefined,
    })
    .eq("clinic_id", clinicId)
    .in("status", ["succeeded", "pending"])
    // Newest money first by the date it was received; unpaid (pending) links go last. Stable paging.
    .order("paid_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .order("id", { ascending: false });
  if (filter === "pending") query = query.eq("status", "pending");
  if (paginated) {
    const from = (page - 1) * TRANSACTION_PAGE_SIZE;
    query = query.range(from, from + TRANSACTION_PAGE_SIZE - 1);
  } else {
    query = query.limit(limitOrPage);
  }
  const { data, count, error } = await query;
  if (error?.code === "PGRST103" && paginated) {
    // Page is past the last row: report the total so the page can clamp to the last page.
    let c = supabase
      .from("payments")
      .select("id", { count: "exact", head: true })
      .eq("clinic_id", clinicId)
      .in("status", ["succeeded", "pending"]);
    if (filter === "pending") c = c.eq("status", "pending");
    const counted = await c;
    check(counted.error, "payments");
    return { items: [], total: counted.count ?? 0 };
  }
  check(error, "payments");
  const payments = z.array(paymentRow).parse(data ?? []);

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
        title: (inv && patientName.get(inv.patientId)) ?? "Patient",
        subtitle: `INV-${String(inv?.number ?? 0).padStart(4, "0")} · ${methodLabel(p.method)}`,
        status: p.status === "succeeded" ? "paid" : "pending",
        centavos: p.amount_centavos,
        at: p.paid_at ?? p.created_at,
        invoiceId: p.invoice_id,
      };
    }),
  ];
  return { items: paginated ? items : items.slice(0, limitOrPage), total: count ?? items.length };
}

/** Succeeded payments in the last ~12 months, for the collections chart and the payment-method mix. */
export async function collectionsData(clinicId: string, sinceIso: string, tz: string) {
  const supabase = await createClient();
  const pageSize = 1000;
  const data: unknown[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data: page, error } = await supabase
      .from("payments")
      .select("id, method, amount_centavos, paid_at")
      .eq("clinic_id", clinicId)
      .eq("status", "succeeded")
      .gte("paid_at", sinceIso)
      .order("paid_at", { ascending: true })
      .order("id", { ascending: true })
      .range(from, from + pageSize - 1);
    check(error, "collections");
    data.push(...(page ?? []));
    if (!page || page.length < pageSize) break;
  }
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
