"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assistantSettingsSchema } from "@/features/assistant/settings";
import { logAudit } from "@/features/audit/log";
import { requestPaymentAction } from "@/features/invoices/actions";
import { can } from "@/features/auth/permissions";
import { getWorkspace } from "@/features/auth/workspace";
import { echo, formString, validationFailed, type ActionState } from "@/lib/action-state";
import { createClient } from "@/lib/supabase/server";
import {
  CONVERSATION_PAGE_SIZE,
  lastMessages,
  listConversations,
  type InboxFilter,
} from "@/features/assistant/queries";
import { patientNames } from "@/features/patients/queries";
import { dateOf, formatDateShort, formatTime, todayIn } from "@/lib/datetime";

const DENIED: ActionState = { message: "You do not have permission to do that." };

async function inboxCtx() {
  const ws = await getWorkspace();
  if (!ws?.membership || !can(ws.membership.role, "inbox.view")) return null;
  return { clinic: ws.membership.clinic };
}

/** Fetches one more inbox batch for the scrollable Dr. Pill conversation list. */
export async function loadMoreConversationsAction(page: number, filter: InboxFilter) {
  const context = await inboxCtx();
  if (!context) return { items: [], total: 0, hasMore: false };
  if (!Number.isInteger(page) || page < 2 || page > 100_000 || !["all", "needs"].includes(filter))
    return { items: [], total: 0, hasMore: false };

  const { clinic } = context;
  const [{ rows, total }] = await Promise.all([listConversations(clinic.id, filter, page)]);
  const [previews, names] = await Promise.all([
    lastMessages(rows.map((conversation) => conversation.id)),
    patientNames(
      clinic.id,
      rows.map((conversation) => conversation.patient_id).filter((id): id is string => Boolean(id)),
    ),
  ]);
  const today = todayIn(clinic.timezone);
  const items = rows.map((conversation) => {
    const patientName = conversation.patient_id
      ? names.get(conversation.patient_id)?.name
      : undefined;
    const date = dateOf(conversation.last_message_at, clinic.timezone);
    return {
      id: conversation.id,
      status: conversation.status,
      handledBy: conversation.handled_by,
      label:
        patientName ??
        (conversation.patient_id
          ? "Patient"
          : `Web visitor · ${date === today ? formatTime(conversation.created_at, clinic.timezone) : formatDateShort(date)}`),
      time:
        date === today
          ? formatTime(conversation.last_message_at, clinic.timezone)
          : formatDateShort(date),
      preview: previews.get(conversation.id) ?? "No messages",
    };
  });
  return { items, total, hasMore: page * CONVERSATION_PAGE_SIZE < total };
}

const idSchema = z.uuid();

export async function sendStaffMessageAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const c = await inboxCtx();
  if (!c) return DENIED;
  const parsed = z
    .object({
      conversationId: idSchema,
      message: z
        .string()
        .trim()
        .min(1, "Type a reply.")
        .max(1000, "Keep it under 1,000 characters."),
    })
    .safeParse({
      conversationId: formString(formData, "conversationId"),
      message: formString(formData, "message"),
    });
  if (!parsed.success) return validationFailed(parsed.error, formData, ["message"]);

  const { conversationId, message } = parsed.data;
  const supabase = await createClient();
  // Row Level Security only allows role 'staff' / handled_by 'human' messages into this clinic's conversations.
  const { error } = await supabase.from("messages").insert({
    clinic_id: c.clinic.id,
    conversation_id: conversationId,
    role: "staff",
    handled_by: "human",
    content: message,
  });
  if (error)
    return { message: "We could not send that reply.", values: echo(formData, ["message"]) };
  await Promise.all([
    supabase
      .from("conversations")
      .update({ handled_by: "human", status: "open" })
      .eq("id", conversationId)
      .eq("clinic_id", c.clinic.id),
    logAudit(supabase, c.clinic.id, "conversation.replied", "conversation", conversationId),
  ]);
  revalidatePath("/dr-pill");
  return { ok: true };
}

async function setConversation(
  formData: FormData,
  patch: { status?: "open" | "resolved"; handled_by?: "ai" | "human" },
  action: string,
): Promise<ActionState> {
  const c = await inboxCtx();
  if (!c) return DENIED;
  const id = idSchema.safeParse(formString(formData, "conversationId"));
  if (!id.success) return { message: "Invalid conversation." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("conversations")
    .update(patch)
    .eq("id", id.data)
    .eq("clinic_id", c.clinic.id)
    .select("id");
  if (error || !data?.length) return { message: "We could not update that conversation." };
  await logAudit(supabase, c.clinic.id, action, "conversation", id.data);
  revalidatePath("/dr-pill");
  return { ok: true };
}

export const handBackAction = async (_p: ActionState, f: FormData) =>
  setConversation(f, { handled_by: "ai", status: "open" }, "conversation.handed_back");
export const resolveConversationAction = async (_p: ActionState, f: FormData) =>
  setConversation(f, { status: "resolved" }, "conversation.resolved");

async function decideMcpPayment(
  formData: FormData,
  decision: "approved" | "rejected",
): Promise<ActionState> {
  const ws = await getWorkspace();
  const m = ws?.membership;
  if (!m || !can(m.role, "inbox.view") || !can(m.role, "invoices.create")) return DENIED;
  const id = idSchema.safeParse(formString(formData, "requestId"));
  if (!id.success) return { message: "Request not found." };
  const supabase = await createClient();

  if (decision === "approved") {
    const paymentForm = new FormData();
    paymentForm.set("mcpRequestId", id.data);
    const payment = await requestPaymentAction({}, paymentForm);
    if (!payment.ok) return { message: payment.message ?? "Could not create the payment link." };
  } else {
    const { data: decided, error } = await supabase.rpc("decide_mcp_payment_request", {
      p_action_id: id.data,
      p_approved: false,
    });
    if (error || decided !== true)
      return { message: "Another staff member already decided this request." };
  }
  await logAudit(
    supabase,
    m.clinic.id,
    `mcp.payment_request_${decision}`,
    "mcp_payment_request",
    id.data,
  );
  revalidatePath("/dr-pill/activity");
  revalidatePath("/invoices");
  return {
    ok: true,
    message:
      decision === "approved" ? "Payment link created and request approved." : "Request rejected.",
  };
}

export const approveMcpPaymentRequestAction = async (_p: ActionState, f: FormData) =>
  decideMcpPayment(f, "approved");
export const rejectMcpPaymentRequestAction = async (_p: ActionState, f: FormData) =>
  decideMcpPayment(f, "rejected");

/** Dr. Pill's abilities and tone (same switches as onboarding), without the onboarding redirect. */
export async function updateAssistantSettingsAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ws = await getWorkspace();
  if (!ws?.membership || !can(ws.membership.role, "staff.manage")) return DENIED;
  const parsed = assistantSettingsSchema.safeParse({
    answer_questions: formData.get("answer_questions") === "on",
    book_appointments: formData.get("book_appointments") === "on",
    send_reminders: formData.get("send_reminders") === "on",
    share_payment_links: formData.get("share_payment_links") === "on",
    tone: formString(formData, "tone"),
  });
  if (!parsed.success) return validationFailed(parsed.error);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("clinics")
    .update({ assistant_settings: parsed.data })
    .eq("id", ws.membership.clinic.id)
    .select("id");
  if (error || !data?.length) return { message: "We could not save your choices." };
  await logAudit(
    supabase,
    ws.membership.clinic.id,
    "assistant.settings_updated",
    "clinic",
    ws.membership.clinic.id,
  );
  revalidatePath("/settings/dr-pill");
  return { ok: true, message: "Saved." };
}

const rulesSchema = z.object({
  bookingAutonomy: z.enum(["auto", "suggest"]),
  bookingLimit: z.coerce.number().int().min(0).max(10000),
  replyLimit: z.coerce.number().int().min(0).max(10000),
});

/** Booking mode (Dr. Pill books by itself, or collects details and a person books) and the daily limits. */
export async function saveAgentRulesAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ws = await getWorkspace();
  if (!ws?.membership || !can(ws.membership.role, "staff.manage")) return DENIED;
  const parsed = rulesSchema.safeParse({
    bookingAutonomy: formString(formData, "bookingAutonomy"),
    bookingLimit: formString(formData, "bookingLimit"),
    replyLimit: formString(formData, "replyLimit"),
  });
  if (!parsed.success)
    return validationFailed(parsed.error, formData, ["bookingLimit", "replyLimit"]);

  const supabase = await createClient();
  const clinicId = ws.membership.clinic.id;
  const rows = [
    {
      kind: "book_appointment" as const,
      autonomy: parsed.data.bookingAutonomy,
      daily_limit: parsed.data.bookingLimit,
    },
    { kind: "reply" as const, autonomy: "auto" as const, daily_limit: parsed.data.replyLimit },
  ];
  for (const r of rows) {
    const { data, error } = await supabase
      .from("agent_rules")
      .update({ autonomy: r.autonomy, daily_limit: r.daily_limit })
      .eq("clinic_id", clinicId)
      .eq("kind", r.kind)
      .select("id");
    if (error) return { message: "We could not save the limits." };
    if (!data?.length) {
      const { error: insertError } = await supabase.from("agent_rules").insert({
        clinic_id: clinicId,
        kind: r.kind,
        autonomy: r.autonomy,
        daily_limit: r.daily_limit,
      });
      if (insertError) return { message: "We could not save the limits." };
    }
  }
  await logAudit(supabase, clinicId, "assistant.rules_updated", "clinic", clinicId);
  revalidatePath("/settings/dr-pill");
  return { ok: true, message: "Saved." };
}
