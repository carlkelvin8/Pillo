import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export const REASON_LABEL = {
  emergency: "Possible emergency",
  medical: "Medical question",
  refund: "Refund or billing",
  upset: "Upset patient",
  requested: "Asked for a person",
  booking: "Booking to confirm",
  other: "Needs attention",
} as const;

const conversationRow = z.object({
  id: z.string(),
  status: z.enum(["open", "needs_human", "resolved"]),
  handled_by: z.enum(["ai", "human"]),
  handoff_reason: z
    .enum(["emergency", "medical", "refund", "upset", "requested", "booking", "other"])
    .nullable(),
  handoff_summary: z.string().nullable(),
  patient_id: z.string().nullable(),
  last_message_at: z.string(),
  created_at: z.string(),
});
export type ConversationRow = z.infer<typeof conversationRow>;

// token_hash is never selectable by clients, so columns are always listed explicitly.
const COLUMNS =
  "id, status, handled_by, handoff_reason, handoff_summary, patient_id, last_message_at, created_at";

function check(error: { code?: string } | null, what: string): void {
  if (error) throw new Error(`Could not load ${what} (${error.code ?? "error"})`);
}

export type InboxFilter = "all" | "needs";
export const CONVERSATION_PAGE_SIZE = 20;

export async function listConversations(
  clinicId: string,
  filter: InboxFilter,
  page = 1,
): Promise<{ rows: ConversationRow[]; total: number }> {
  const supabase = await createClient();
  let q = supabase
    .from("conversations")
    .select(COLUMNS, { count: "exact" })
    .eq("clinic_id", clinicId)
    .order("last_message_at", { ascending: false })
    .order("id", { ascending: true });
  if (filter === "needs") q = q.eq("status", "needs_human");
  const from = (Math.max(1, page) - 1) * CONVERSATION_PAGE_SIZE;
  const { data, count, error } = await q.range(from, from + CONVERSATION_PAGE_SIZE - 1);
  if (error?.code === "PGRST103") return { rows: [], total: count ?? 0 };
  check(error, "conversations");
  return { rows: z.array(conversationRow).parse(data ?? []), total: count ?? 0 };
}

export async function needsHumanCount(clinicId: string): Promise<number> {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("conversations")
    .select("id", { count: "exact", head: true })
    .eq("clinic_id", clinicId)
    .eq("status", "needs_human");
  check(error, "conversations");
  return count ?? 0;
}

export async function getConversation(
  clinicId: string,
  id: string,
): Promise<ConversationRow | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("conversations")
    .select(COLUMNS)
    .eq("clinic_id", clinicId)
    .eq("id", id)
    .maybeSingle();
  check(error, "conversation");
  return data ? conversationRow.parse(data) : null;
}

const messageRow = z.object({
  id: z.string(),
  role: z.enum(["patient", "assistant", "staff", "system"]),
  handled_by: z.enum(["ai", "human"]).nullable(),
  content: z.string(),
  created_at: z.string(),
});
export type MessageRow = z.infer<typeof messageRow>;

export async function conversationMessages(conversationId: string): Promise<MessageRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("messages")
    .select("id, role, handled_by, content, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(1000);
  check(error, "messages");
  return z
    .array(messageRow)
    .parse(data ?? [])
    .reverse();
}

/** Latest message text per conversation, for the list preview. */
export async function lastMessages(ids: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (ids.length === 0) return out;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("messages")
    .select("conversation_id, content, role, created_at")
    .in("conversation_id", ids)
    .neq("role", "system")
    .order("created_at", { ascending: false })
    .limit(400);
  check(error, "messages");
  for (const r of z
    .array(z.object({ conversation_id: z.string(), content: z.string() }))
    .parse(data ?? []))
    if (!out.has(r.conversation_id)) out.set(r.conversation_id, r.content);
  return out;
}

const actionRow = z.object({
  id: z.string(),
  conversation_id: z.string().nullable(),
  kind: z.string(),
  status: z.enum(["proposed", "approved", "executed", "rejected", "failed"]),
  autonomy: z.enum(["suggest", "approve", "auto"]),
  outcome: z.string().nullable(),
  created_at: z.string(),
});
export type ActionRow = z.infer<typeof actionRow>;
export const ACTION_PAGE_SIZE = 20;

export async function listActions(
  clinicId: string,
  page = 1,
): Promise<{ rows: ActionRow[]; total: number }> {
  const supabase = await createClient();
  const from = (Math.max(1, page) - 1) * ACTION_PAGE_SIZE;
  const { data, count, error } = await supabase
    .from("agent_actions")
    .select("id, conversation_id, kind, status, autonomy, outcome, created_at", { count: "exact" })
    .eq("clinic_id", clinicId)
    .neq("kind", "reply")
    .order("created_at", { ascending: false })
    .range(from, from + ACTION_PAGE_SIZE - 1);
  if (error?.code === "PGRST103") {
    // Page is past the last row: PostgREST refuses the range. Report the total so the page can clamp.
    const counted = await supabase
      .from("agent_actions")
      .select("id", { count: "exact", head: true })
      .eq("clinic_id", clinicId)
      .neq("kind", "reply");
    check(counted.error, "activity");
    return { rows: [], total: counted.count ?? 0 };
  }
  check(error, "activity");
  return { rows: z.array(actionRow).parse(data ?? []), total: count ?? 0 };
}

export type McpPaymentRequest = {
  id: string;
  invoiceId: string;
  invoiceNumber: number;
  dueCentavos: number;
  createdAt: string;
};

/** Payment proposals contain invoice identifiers only; patient names and contact data stay out of the activity log. */
export async function listMcpPaymentRequests(clinicId: string): Promise<McpPaymentRequest[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("agent_actions")
    .select("id, payload, created_at")
    .eq("clinic_id", clinicId)
    .eq("kind", "mcp_request_payment")
    .eq("status", "proposed")
    .order("created_at", { ascending: true })
    .limit(50);
  check(error, "MCP payment requests");
  const proposals = z
    .array(
      z.object({
        id: z.string(),
        payload: z.record(z.string(), z.unknown()),
        created_at: z.string(),
      }),
    )
    .parse(data ?? []);
  const ids = proposals
    .map((p) => p.payload.invoice_id)
    .filter((v): v is string => typeof v === "string");
  if (ids.length === 0) return [];
  const { data: invoices, error: invoiceError } = await supabase
    .from("invoices")
    .select("id, invoice_number, total_centavos")
    .eq("clinic_id", clinicId)
    .in("id", ids);
  check(invoiceError, "MCP request invoices");
  const { data: payments, error: paymentError } = await supabase
    .from("payments")
    .select("invoice_id, amount_centavos, status")
    .eq("clinic_id", clinicId)
    .in("invoice_id", ids)
    .eq("status", "succeeded");
  check(paymentError, "MCP request payments");
  const paidByInvoice = new Map<string, number>();
  for (const payment of payments ?? []) {
    const invoiceId = String(payment.invoice_id);
    paidByInvoice.set(
      invoiceId,
      (paidByInvoice.get(invoiceId) ?? 0) + Number(payment.amount_centavos),
    );
  }
  const byId = new Map((invoices ?? []).map((invoice) => [String(invoice.id), invoice]));
  return proposals.flatMap((p) => {
    const invoiceId = p.payload.invoice_id;
    const invoice = typeof invoiceId === "string" ? byId.get(invoiceId) : undefined;
    const dueCentavos = invoice
      ? Number(invoice.total_centavos) - (paidByInvoice.get(String(invoice.id)) ?? 0)
      : 0;
    return invoice && dueCentavos > 0
      ? [
          {
            id: p.id,
            invoiceId: String(invoice.id),
            invoiceNumber: Number(invoice.invoice_number),
            dueCentavos,
            createdAt: p.created_at,
          },
        ]
      : [];
  });
}

export async function actionCountsSince(clinicId: string, sinceIso: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("agent_actions")
    .select("kind, status")
    .eq("clinic_id", clinicId)
    .gte("created_at", sinceIso)
    .limit(2000);
  check(error, "activity");
  const rows = z.array(z.object({ kind: z.string(), status: z.string() })).parse(data ?? []);
  const n = (kind: string, status?: string) =>
    rows.filter((r) => r.kind === kind && (!status || r.status === status)).length;
  return {
    replies: n("reply", "executed"),
    bookings: n("book_appointment", "executed"),
    handoffs: n("handoff") + n("book_appointment", "proposed"),
  };
}

export type RuleRow = {
  kind: "reply" | "book_appointment";
  autonomy: "suggest" | "approve" | "auto";
  daily_limit: number;
};
export async function getRules(
  clinicId: string,
): Promise<Record<"reply" | "book_appointment", RuleRow>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("agent_rules")
    .select("kind, autonomy, daily_limit")
    .eq("clinic_id", clinicId)
    .in("kind", ["reply", "book_appointment"]);
  check(error, "rules");
  // Other agent features (for example chair-filler) share this table but have
  // their own settings UI. Ignore their rows before validating this editor's shape.
  const supportedKinds = new Set(["reply", "book_appointment"]);
  const supportedData = Array.isArray(data)
    ? data.filter(
        (row) =>
          typeof row === "object" &&
          row !== null &&
          "kind" in row &&
          supportedKinds.has(String(row.kind)),
      )
    : data;
  const rows = z
    .array(
      z.object({
        kind: z.enum(["reply", "book_appointment"]),
        autonomy: z.enum(["suggest", "approve", "auto"]),
        daily_limit: z.number(),
      }),
    )
    .parse(supportedData ?? []);
  const find = (k: RuleRow["kind"], dflt: number): RuleRow =>
    rows.find((r) => r.kind === k) ?? { kind: k, autonomy: "auto", daily_limit: dflt };
  return { reply: find("reply", 300), book_appointment: find("book_appointment", 30) };
}
