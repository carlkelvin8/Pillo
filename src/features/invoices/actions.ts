"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { logAudit } from "@/features/audit/log";
import { can } from "@/features/auth/permissions";
import { getWorkspace } from "@/features/auth/workspace";
import { getPaymentProvider } from "@/features/payments/provider";
import { amountPaid, getInvoice } from "./queries";
import { invoiceFormSchema, invoiceIdSchema, recordPaymentSchema } from "./schemas";
import { invoiceLabel } from "./totals";
import { echo, formString, type ActionState } from "@/lib/action-state";
import { createClient } from "@/lib/supabase/server";
import { invoiceItemSchema } from "./schemas";
import { isDateString } from "@/lib/datetime";

const DENIED: ActionState = { message: "You do not have permission to do that." };

async function ctx() {
  const ws = await getWorkspace();
  if (!ws?.membership || !can(ws.membership.role, "invoices.create")) return null;
  return { user: ws.user, clinic: ws.membership.clinic, role: ws.membership.role };
}

/** Errors thrown by our database guards carry a readable message; show only those, never raw SQL errors. */
const GUARDS = [/draft/i, /more than the amount due/i, /sent invoice/i, /cannot be voided/i];
function friendly(error: { message?: string }, fallback: string): string {
  const m = error.message ?? "";
  return GUARDS.some((g) => g.test(m)) ? m : fallback;
}

export async function createInvoiceAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const c = await ctx();
  if (!c) return DENIED;
  const descriptions = formData.getAll("itemDescription").map(String);
  const quantities = formData.getAll("itemQuantity").map(String);
  const prices = formData.getAll("itemPrice").map(String);
  const rows = descriptions.map((description, i) => ({
    description,
    quantity: quantities[i] ?? "1",
    price: prices[i] ?? "0",
  }));
  // Blank trailing rows are ignored; a row with only a price or quantity is still an error.
  const items = rows.filter(
    (r) => r.description.trim() !== "" || (r.price.trim() !== "" && r.price.trim() !== "0"),
  );

  const doctorId = formString(formData, "doctorId");
  const branchId = formString(formData, "branchId");
  const parsed = invoiceFormSchema.safeParse({
    patientId: formString(formData, "patientId"),
    doctorId: doctorId === "" ? undefined : doctorId,
    branchId: branchId === "" ? undefined : branchId,
    issuedOn: formString(formData, "issuedOn"),
    dueOn: formString(formData, "dueOn"),
    note: formString(formData, "note"),
    discount: formString(formData, "discount"),
    tax: formString(formData, "tax"),
    items,
    sendNow: formString(formData, "intent") === "send",
  });
  if (!parsed.success) {
    const errors: Record<string, string[] | undefined> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "form");
      errors[key] = [...(errors[key] ?? []), issue.message];
    }
    return {
      message: "Please check the highlighted fields.",
      fieldErrors: errors,
      values: echo(formData, ["issuedOn", "dueOn", "note", "discount", "tax"]),
    };
  }
  const v = parsed.data;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_invoice", {
    p_clinic_id: c.clinic.id,
    p_patient_id: v.patientId,
    p_doctor_id: v.doctorId ?? null,
    p_branch_id: v.branchId ?? null,
    p_issued_on: v.issuedOn,
    p_due_on: v.dueOn,
    p_note: v.note ?? null,
    p_discount_centavos: v.discount,
    p_tax_centavos: v.tax,
    p_items: v.items.map((i) => ({
      description: i.description,
      quantity: i.quantity,
      unit_price_centavos: i.price,
    })),
  });
  if (error || typeof data !== "string")
    return {
      message: "We could not create the invoice. Nothing was saved.",
      values: echo(formData, ["issuedOn", "dueOn", "note", "discount", "tax"]),
    };

  await logAudit(supabase, c.clinic.id, "invoice.created", "invoice", data);
  if (v.sendNow) {
    const { error: sendError } = await supabase
      .from("invoices")
      .update({ status: "sent" })
      .eq("id", data)
      .eq("clinic_id", c.clinic.id);
    if (!sendError) await logAudit(supabase, c.clinic.id, "invoice.sent", "invoice", data);
  }
  revalidatePath("/invoices");
  redirect(`/invoices/${data}`);
}

export async function sendInvoiceAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const c = await ctx();
  if (!c) return DENIED;
  const parsed = invoiceIdSchema.safeParse({ invoiceId: formString(formData, "invoiceId") });
  if (!parsed.success) return { message: "Invalid invoice." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("invoices")
    .update({ status: "sent" })
    .eq("id", parsed.data.invoiceId)
    .eq("clinic_id", c.clinic.id)
    .eq("status", "draft")
    .select("id");
  if (error || !data?.length) return { message: "We could not send that invoice." };
  await logAudit(supabase, c.clinic.id, "invoice.sent", "invoice", parsed.data.invoiceId);
  revalidatePath(`/invoices/${parsed.data.invoiceId}`);
  revalidatePath("/invoices");
  return { ok: true, message: "Invoice marked as sent." };
}

export async function updateDraftInvoiceAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const c = await ctx();
  if (!c) return DENIED;
  const invoiceId = formString(formData, "invoiceId");
  const patientId = formString(formData, "patientId");
  const dueOn = formString(formData, "dueOn");
  if (!invoiceIdSchema.safeParse({ invoiceId }).success || !/^[0-9a-f-]{36}$/i.test(patientId)) return { message: "Choose a valid patient and invoice." };
  const itemsRaw = formData.getAll("items").map(String);
  if (itemsRaw.length < 1 || itemsRaw.length > 50) return { message: "Add between 1 and 50 line items." };
  const items = [];
  for (const raw of itemsRaw) {
    let value: unknown;
    try { value = JSON.parse(raw); } catch { return { message: "Check the invoice items." }; }
    const parsedItem = invoiceItemSchema.safeParse(value);
    if (!parsedItem.success) return { message: parsedItem.error.issues[0]?.message ?? "Check the invoice items." };
    items.push(parsedItem.data);
  }
  if (!isDateString(dueOn)) return { message: "Choose a valid due date." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("update_draft_invoice", {
    p_clinic_id: c.clinic.id,
    p_invoice_id: invoiceId,
    p_patient_id: patientId,
    p_due_on: dueOn,
    p_items: items.map((item) => ({ description: item.description, quantity: item.quantity, unit_price_centavos: item.price })),
  });
  if (error) return { message: friendly(error, "We could not save that draft invoice.") };
  await logAudit(supabase, c.clinic.id, "invoice.updated", "invoice", invoiceId, { item_count: items.length });
  revalidatePath(`/invoices/${invoiceId}`);
  revalidatePath("/invoices");
  return { ok: true, message: "Draft invoice saved." };
}

export async function logInvoiceLinkSharedAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const c = await ctx();
  if (!c) return DENIED;
  const parsed = invoiceIdSchema.safeParse({ invoiceId: formString(formData, "invoiceId") });
  if (!parsed.success) return { message: "Invalid invoice." };
  const supabase = await createClient();
  const { data } = await supabase.from("payments").select("id").eq("clinic_id", c.clinic.id).eq("invoice_id", parsed.data.invoiceId).eq("status", "pending").not("checkout_url", "is", null).limit(1);
  if (!data?.length) return { message: "Create a payment link before sharing." };
  await logAudit(supabase, c.clinic.id, "invoice.link_shared", "invoice", parsed.data.invoiceId);
  return { ok: true, message: "Share action logged." };
}

export async function voidInvoiceAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const c = await ctx();
  if (!c) return DENIED;
  const parsed = invoiceIdSchema.safeParse({ invoiceId: formString(formData, "invoiceId") });
  if (!parsed.success) return { message: "Invalid invoice." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("invoices")
    .update({ status: "void" })
    .eq("id", parsed.data.invoiceId)
    .eq("clinic_id", c.clinic.id)
    .in("status", ["draft", "sent"])
    .select("id");
  if (error) return { message: friendly(error, "We could not void that invoice.") };
  if (!data?.length) return { message: "We could not void that invoice." };
  await logAudit(supabase, c.clinic.id, "invoice.voided", "invoice", parsed.data.invoiceId);
  revalidatePath(`/invoices/${parsed.data.invoiceId}`);
  revalidatePath("/invoices");
  return { ok: true, message: "Invoice voided." };
}

/** Creates (or reuses) a payment link for what is still owed. Staff clicking the button IS the approval. */
export async function requestPaymentAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const c = await ctx();
  if (!c) return DENIED;
  const mcpRequestId = formString(formData, "mcpRequestId");
  const supabase = await createClient();
  let invoiceId = "";
  if (mcpRequestId) {
    if (!can(c.role, "inbox.view")) return DENIED;
    if (!invoiceIdSchema.safeParse({ invoiceId: mcpRequestId }).success) return { message: "Request not found." };
    const { data: request } = await supabase.from("agent_actions")
      .select("payload").eq("id", mcpRequestId).eq("clinic_id", c.clinic.id)
      .eq("kind", "mcp_request_payment").eq("status", "proposed").maybeSingle();
    const candidate = (request?.payload as { invoice_id?: unknown } | null)?.invoice_id;
    if (typeof candidate !== "string" || !invoiceIdSchema.safeParse({ invoiceId: candidate }).success)
      return { message: "Request not found." };
    invoiceId = candidate;
  } else {
    const parsed = invoiceIdSchema.safeParse({ invoiceId: formString(formData, "invoiceId") });
    if (!parsed.success) return { message: "Invalid invoice." };
    invoiceId = parsed.data.invoiceId;
  }

  const detail = await getInvoice(c.clinic.id, invoiceId);
  if (!detail) return { message: "Invoice not found." };
  const { invoice, payments } = detail;
  if (invoice.status === "paid" || invoice.status === "void")
    return { message: "This invoice does not need a payment link." };

  const existing = payments.find((p) => p.status === "pending" && p.checkout_url);
  if (existing) {
    if (mcpRequestId) {
      const { data, error } = await supabase.rpc("decide_mcp_payment_request", {
        p_action_id: mcpRequestId,
        p_approved: true,
      });
      if (error || data !== true) return { message: "Another staff member already decided this request." };
    }
    return { ok: true, message: "A payment link is already open for this invoice." };
  }

  const due = invoice.total_centavos - amountPaid(payments);
  if (due <= 0) return { message: "Nothing is due on this invoice." };

  const provider = getPaymentProvider();
  if (!provider) {
    return {
      message:
        "Online payments are not set up yet. The clinic owner needs to add the PayMongo keys. You can still record cash or bank payments.",
    };
  }

  if (invoice.status === "draft") {
    const { error } = await supabase
      .from("invoices")
      .update({ status: "sent" })
      .eq("id", invoice.id)
      .eq("clinic_id", c.clinic.id);
    if (error) return { message: "We could not send the invoice first." };
    await logAudit(supabase, c.clinic.id, "invoice.sent", "invoice", invoice.id);
  }

  // Claim the approval before calling the provider so a second staff click cannot create a duplicate link.
  if (mcpRequestId) {
    const { data, error } = await supabase.rpc("decide_mcp_payment_request", {
      p_action_id: mcpRequestId,
      p_approved: true,
    });
    if (error || data !== true) return { message: "Another staff member already decided this request." };
  }

  let link;
  try {
    // The description never contains the patient's name or details.
    link = await provider.createPaymentLink({
      amountCentavos: due,
      description: invoiceLabel(invoice.invoice_number),
    });
  } catch {
    if (mcpRequestId) {
      const { error } = await supabase.rpc("fail_mcp_payment_request", { p_action_id: mcpRequestId });
      if (error) console.error("MCP payment request failure could not be recorded", { code: error.code });
      else await logAudit(supabase, c.clinic.id, "mcp.payment_request_failed", "mcp_payment_request", mcpRequestId);
    }
    return {
      message: "The payment provider did not accept the request. Please try again in a moment.",
    };
  }

  const { error } = await supabase.from("payments").insert({
    clinic_id: c.clinic.id,
    invoice_id: invoice.id,
    amount_centavos: due,
    status: "pending",
    provider: link.provider,
    provider_ref: link.providerRef,
    checkout_url: link.checkoutUrl,
  });
  if (error) {
    if (mcpRequestId) {
      const { error: decisionError } = await supabase.rpc("fail_mcp_payment_request", { p_action_id: mcpRequestId });
      if (decisionError) console.error("MCP payment request failure could not be recorded", { code: decisionError.code });
      else await logAudit(supabase, c.clinic.id, "mcp.payment_request_failed", "mcp_payment_request", mcpRequestId);
    }
    return { message: friendly(error, "We could not save the payment link.") };
  }

  await logAudit(supabase, c.clinic.id, "payment.link_created", "invoice", invoice.id, {
    provider: link.provider,
    centavos: due,
  });
  revalidatePath(`/invoices/${invoice.id}`);
  return { ok: true, message: "Payment link created." };
}

export async function cancelPaymentLinkAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const c = await ctx();
  if (!c) return DENIED;
  const id = formString(formData, "paymentId");
  const invoiceId = formString(formData, "invoiceId");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { message: "Invalid payment." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("payments")
    .update({ status: "cancelled" })
    .eq("id", id)
    .eq("clinic_id", c.clinic.id)
    .eq("status", "pending")
    .select("id");
  if (error || !data?.length) return { message: "We could not cancel that link." };
  await logAudit(supabase, c.clinic.id, "payment.link_cancelled", "payment", id);
  revalidatePath(`/invoices/${invoiceId}`);
  return { ok: true, message: "Link cancelled." };
}

export async function recordPaymentAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const c = await ctx();
  if (!c) return DENIED;
  const parsed = recordPaymentSchema.safeParse({
    invoiceId: formString(formData, "invoiceId"),
    method: formString(formData, "method"),
    amount: formString(formData, "amount"),
    reference: formString(formData, "reference"),
  });
  if (!parsed.success) {
    const errors: Record<string, string[] | undefined> = {};
    for (const issue of parsed.error.issues)
      errors[String(issue.path[0] ?? "form")] = [issue.message];
    return {
      message: "Please check the highlighted fields.",
      fieldErrors: errors,
      values: echo(formData, ["amount", "reference"]),
    };
  }
  const supabase = await createClient();
  const { data: inv } = await supabase
    .from("invoices")
    .select("status")
    .eq("id", parsed.data.invoiceId)
    .eq("clinic_id", c.clinic.id)
    .maybeSingle();
  const status = (inv as { status: string } | null)?.status;
  if (!status || status === "void" || status === "paid")
    return { message: "This invoice cannot take a payment." };
  if (status === "draft") {
    const { error } = await supabase
      .from("invoices")
      .update({ status: "sent" })
      .eq("id", parsed.data.invoiceId)
      .eq("clinic_id", c.clinic.id);
    if (error) return { message: "We could not send the invoice first." };
  }
  const { error } = await supabase.from("payments").insert({
    clinic_id: c.clinic.id,
    invoice_id: parsed.data.invoiceId,
    method: parsed.data.method,
    amount_centavos: parsed.data.amount,
    status: "succeeded",
    provider: "manual",
    reference: parsed.data.reference ?? null,
    paid_at: new Date().toISOString(),
  });
  if (error)
    return {
      message: friendly(error, "We could not record that payment."),
      values: echo(formData, ["amount", "reference"]),
    };
  await logAudit(supabase, c.clinic.id, "payment.recorded", "invoice", parsed.data.invoiceId, {
    method: parsed.data.method,
    centavos: parsed.data.amount,
  });
  revalidatePath(`/invoices/${parsed.data.invoiceId}`);
  revalidatePath("/invoices");
  revalidatePath("/payments");
  return { ok: true, message: "Payment recorded." };
}
