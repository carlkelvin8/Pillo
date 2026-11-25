"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { logAudit } from "@/features/audit/log";
import { can } from "@/features/auth/permissions";
import { getWorkspace } from "@/features/auth/workspace";
import { offerMessage } from "@/features/chair-filler/message";
import { formString, validationFailed, type ActionState } from "@/lib/action-state";
import { dateOf, formatDateLong, formatTime } from "@/lib/datetime";
import { parsePesosToCentavos } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import { newToken, hashToken } from "@/lib/token";

const DENIED: ActionState = { message: "You do not have permission to do that." };
const OFFER_HOURS = 3;

async function ctx() {
  const ws = await getWorkspace();
  const m = ws?.membership;
  if (!ws || !m || (m.role !== "owner" && m.role !== "receptionist")) return null;
  return { clinic: m.clinic, userId: ws.user.id };
}

/**
 * Approve an offer: make a private link (only its hash is stored), set it to expire, and return the
 * message for staff to send. Staff send it themselves; Pillo does not message patients yet.
 */
export async function approveOfferAction(
  _p: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const c = await ctx();
  if (!c) return DENIED;
  const id = z.uuid().safeParse(formString(formData, "offerId"));
  if (!id.success) return { message: "Offer not found." };

  const supabase = await createClient();
  const { data: o } = await supabase
    .from("slot_offers")
    .select("id, status, starts_at, patient:patients(full_name), doctor:doctors(display_name)")
    .eq("clinic_id", c.clinic.id)
    .eq("id", id.data)
    .maybeSingle();
  const offer = z
    .object({
      status: z.enum(["proposed", "sent"]),
      starts_at: z.string(),
      patient: z.object({ full_name: z.string() }),
      doctor: z.object({ display_name: z.string() }),
    })
    .safeParse(o);
  if (!offer.success) return { message: "This offer can no longer be sent." };
  const startMs = new Date(offer.data.starts_at).getTime();
  if (startMs - Date.now() < 30 * 60_000) return { message: "That slot is too close to start." };

  const token = newToken();
  const expires = new Date(Math.min(Date.now() + OFFER_HOURS * 3600_000, startMs - 30 * 60_000));
  const { data, error } = await supabase
    .from("slot_offers")
    .update({
      status: "sent",
      token_hash: hashToken(token),
      expires_at: expires.toISOString(),
      sent_at: new Date().toISOString(),
      decided_by: c.userId,
    })
    .eq("id", id.data)
    .eq("clinic_id", c.clinic.id)
    .in("status", ["proposed", "sent"])
    .select("id");
  if (error || !data?.length) return { message: "We could not approve that offer." };

  const tz = c.clinic.timezone;
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const link = `${base}/offer/${token}`;
  const slotLabel = `${formatDateLong(dateOf(offer.data.starts_at, tz))}, ${formatTime(offer.data.starts_at, tz)}`;
  await logAudit(supabase, c.clinic.id, "offer.approved", "slot_offer", id.data);
  revalidatePath("/dr-pill/activity");
  return {
    ok: true,
    message: "Approved. Send this message to the patient.",
    data: {
      link,
      text: offerMessage({
        fullName: offer.data.patient.full_name,
        clinicName: c.clinic.name,
        doctorName: offer.data.doctor.display_name,
        slotLabel,
        link,
      }),
    },
  };
}

export async function skipOfferAction(_p: ActionState, formData: FormData): Promise<ActionState> {
  const c = await ctx();
  if (!c) return DENIED;
  const id = z.uuid().safeParse(formString(formData, "offerId"));
  if (!id.success) return { message: "Offer not found." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("slot_offers")
    .update({ status: "skipped", decided_by: c.userId })
    .eq("id", id.data)
    .eq("clinic_id", c.clinic.id)
    .in("status", ["proposed", "sent"])
    .select("id");
  if (error || !data?.length) return { message: "We could not skip that offer." };
  await logAudit(supabase, c.clinic.id, "offer.skipped", "slot_offer", id.data);
  revalidatePath("/dr-pill/activity");
  return { ok: true, message: "Skipped." };
}

const settingsSchema = z.object({
  visitValue: z
    .string()
    .trim()
    .transform((v, ctx) => {
      if (v === "") return null;
      const c = parsePesosToCentavos(v);
      if (c === null || c > 100_000_000) {
        ctx.addIssue({ code: "custom", message: "Enter a peso amount, like 1500 or 1,500.50." });
        return z.NEVER;
      }
      return c;
    }),
  offerLimit: z.coerce
    .number()
    .int("Whole numbers only.")
    .min(0, "0 or more.")
    .max(200, "200 or less."),
});

/** Owner-only: typical visit value (for the recovered estimate) and how many offers Dr. Pill may draft per day. */
export async function saveChairFillerSettingsAction(
  _p: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ws = await getWorkspace();
  if (!ws?.membership || !can(ws.membership.role, "staff.manage")) return DENIED;
  const parsed = settingsSchema.safeParse({
    visitValue: formString(formData, "visitValue"),
    offerLimit: formString(formData, "offerLimit"),
  });
  if (!parsed.success)
    return validationFailed(parsed.error, formData, ["visitValue", "offerLimit"]);

  const supabase = await createClient();
  const clinicId = ws.membership.clinic.id;
  const { error: clinicError } = await supabase
    .from("clinics")
    .update({ avg_visit_value_centavos: parsed.data.visitValue })
    .eq("id", clinicId);
  if (clinicError) return { message: "We could not save that." };

  const { data, error } = await supabase
    .from("agent_rules")
    .update({ autonomy: "approve", daily_limit: parsed.data.offerLimit })
    .eq("clinic_id", clinicId)
    .eq("kind", "chair_filler")
    .select("id");
  if (error) return { message: "We could not save that." };
  if (!data?.length) {
    const { error: insertError } = await supabase.from("agent_rules").insert({
      clinic_id: clinicId,
      kind: "chair_filler",
      autonomy: "approve",
      daily_limit: parsed.data.offerLimit,
    });
    if (insertError) return { message: "We could not save that." };
  }
  await logAudit(supabase, clinicId, "assistant.chair_filler_settings_updated", "clinic", clinicId);
  revalidatePath("/settings/dr-pill");
  revalidatePath("/dr-pill/activity");
  revalidatePath("/dashboard");
  return { ok: true, message: "Saved." };
}
