"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { assistantSettingsSchema } from "@/features/assistant/settings";
import { logAudit } from "@/features/audit/log";
import { can } from "@/features/auth/permissions";
import { getWorkspace } from "@/features/auth/workspace";
import { clinicDetailsSchema } from "@/features/clinic/schemas";
import { echo, formString, validationFailed, type ActionState } from "@/lib/action-state";
import { createClient } from "@/lib/supabase/server";

const DETAIL_KEYS = ["name", "address", "phone", "email"] as const;
const DENIED: ActionState = { message: "You do not have permission to do that." };

function detailsFromForm(formData: FormData) {
  return clinicDetailsSchema.safeParse({
    name: formString(formData, "name"),
    address: formString(formData, "address"),
    phone: formString(formData, "phone"),
    email: formString(formData, "email"),
  });
}

/** Onboarding step 1. Idempotent: a user who already has a clinic just moves on. */
export async function createClinicAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ws = await getWorkspace();
  if (!ws) redirect("/login");
  if (ws.membership) redirect("/onboarding?step=2");

  const parsed = detailsFromForm(formData);
  if (!parsed.success) return validationFailed(parsed.error, formData, DETAIL_KEYS);

  const supabase = await createClient();
  const { error } = await supabase.rpc("create_clinic", {
    p_name: parsed.data.name,
    p_address: parsed.data.address ?? null,
    p_phone: parsed.data.phone ?? null,
    p_email: parsed.data.email ?? null,
  });
  if (error) {
    return {
      message: "We could not create the clinic. Please try again.",
      values: echo(formData, DETAIL_KEYS),
    };
  }
  redirect("/onboarding?step=2");
}

export async function updateClinicAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ws = await getWorkspace();
  if (!ws?.membership || !can(ws.membership.role, "staff.manage")) return DENIED;

  const parsed = detailsFromForm(formData);
  if (!parsed.success) return validationFailed(parsed.error, formData, DETAIL_KEYS);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("clinics")
    .update({
      name: parsed.data.name,
      address: parsed.data.address ?? null,
      phone: parsed.data.phone ?? null,
      email: parsed.data.email ?? null,
    })
    .eq("id", ws.membership.clinic.id)
    .select("id");
  if (error || !data?.length) return { message: "We could not save your changes." };

  await logAudit(
    supabase,
    ws.membership.clinic.id,
    "clinic.updated",
    "clinic",
    ws.membership.clinic.id,
  );
  revalidatePath("/", "layout");
  return { ok: true, message: "Saved." };
}

/** Onboarding step 3 (also reused by Dr. Pill settings in Phase 4). */
export async function saveAssistantSettingsAction(
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
  redirect("/onboarding?step=4");
}

/** Onboarding final step. */
export async function completeOnboardingAction(): Promise<void> {
  const ws = await getWorkspace();
  if (!ws?.membership || !can(ws.membership.role, "staff.manage")) redirect("/dashboard");

  const supabase = await createClient();
  await supabase
    .from("clinics")
    .update({ onboarding_completed_at: new Date().toISOString() })
    .eq("id", ws.membership.clinic.id);
  await logAudit(
    supabase,
    ws.membership.clinic.id,
    "onboarding.completed",
    "clinic",
    ws.membership.clinic.id,
  );
  revalidatePath("/", "layout");
  redirect("/dashboard");
}
