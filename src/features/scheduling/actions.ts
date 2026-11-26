"use server";

import { revalidatePath } from "next/cache";
import { proposeOffers } from "@/features/chair-filler/propose";
import { logAudit } from "@/features/audit/log";
import { can, type Capability } from "@/features/auth/permissions";
import { getWorkspace } from "@/features/auth/workspace";
import { loadSlotContext } from "@/features/scheduling/queries";
import {
  appointmentFormSchema,
  appointmentStatusSchema,
  rescheduleSchema,
  slotsRequestSchema,
  waitlistSchema,
} from "@/features/scheduling/schemas";
import { isOpenSlot, generateSlots } from "@/features/scheduling/slots";
import { echo, formString, validationFailed, type ActionState } from "@/lib/action-state";
import { createClient } from "@/lib/supabase/server";

const DENIED: ActionState = { message: "You do not have permission to do that." };
const TAKEN: ActionState = { message: "That time is no longer available. Pick another slot." };
const OVERLAP = "23P01"; // exclusion_violation: the doctor is already booked

async function front(capability: Capability = "appointments.book") {
  const ws = await getWorkspace();
  if (!ws?.membership || !can(ws.membership.role, capability)) return null;
  return { user: ws.user, role: ws.membership.role, clinic: ws.membership.clinic };
}

/** Open slots for a doctor on a day. Called from the booking dialogs. */
export async function getSlotsAction(input: unknown): Promise<{ startsAt: string }[]> {
  const ctx = await front("schedule.view");
  const parsed = slotsRequestSchema.safeParse(input);
  if (!ctx || !parsed.success) return [];
  const supabase = await createClient();
  const slotCtx = await loadSlotContext(supabase, {
    clinicId: ctx.clinic.id,
    branchId: parsed.data.branchId,
    doctorId: parsed.data.doctorId,
    date: parsed.data.date,
    tz: ctx.clinic.timezone,
    excludeAppointmentId: parsed.data.excludeAppointmentId,
  });
  return generateSlots({
    date: parsed.data.date,
    tz: ctx.clinic.timezone,
    durationMin: parsed.data.durationMin,
    now: new Date(),
    ...slotCtx,
  }).map((startsAt) => ({ startsAt }));
}

export async function createAppointmentAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await front();
  if (!ctx) return DENIED;
  const parsed = appointmentFormSchema.safeParse({
    patientId: formString(formData, "patientId"),
    doctorId: formString(formData, "doctorId"),
    branchId: formString(formData, "branchId"),
    startsAt: formString(formData, "startsAt"),
    durationMin: formString(formData, "durationMin"),
    reason: formString(formData, "reason"),
    sendReminder: formData.get("sendReminder") === "on",
  });
  if (!parsed.success) return validationFailed(parsed.error, formData, ["reason"]);
  const d = parsed.data;

  const supabase = await createClient();
  const tz = ctx.clinic.timezone;
  const startsAt = new Date(d.startsAt);
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(startsAt); // YYYY-MM-DD in clinic time
  const slotCtx = await loadSlotContext(supabase, {
    clinicId: ctx.clinic.id,
    branchId: d.branchId,
    doctorId: d.doctorId,
    date,
    tz,
  });
  if (
    !isOpenSlot({ date, tz, durationMin: d.durationMin, now: new Date(), ...slotCtx }, d.startsAt)
  )
    return TAKEN;

  const { data, error } = await supabase
    .from("appointments")
    .insert({
      clinic_id: ctx.clinic.id,
      branch_id: d.branchId,
      patient_id: d.patientId,
      doctor_id: d.doctorId,
      starts_at: startsAt.toISOString(),
      ends_at: new Date(startsAt.getTime() + d.durationMin * 60_000).toISOString(),
      reason: d.reason ?? null,
      send_reminder: d.sendReminder,
      status: "scheduled",
      source: "staff",
    })
    .select("id");
  if (error?.code === OVERLAP) return TAKEN;
  if (error || !data?.length) {
    return { message: "We could not book that appointment.", values: echo(formData, ["reason"]) };
  }
  await logAudit(
    supabase,
    ctx.clinic.id,
    "appointment.created",
    "appointment",
    String((data[0] as { id: unknown }).id),
    {
      source: "staff",
    },
  );
  revalidatePath("/appointments");
  return { ok: true, message: "Appointment booked." };
}

export async function rescheduleAppointmentAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await front();
  if (!ctx) return DENIED;
  const parsed = rescheduleSchema.safeParse({
    appointmentId: formString(formData, "appointmentId"),
    startsAt: formString(formData, "startsAt"),
  });
  if (!parsed.success) return validationFailed(parsed.error);

  const supabase = await createClient();
  const tz = ctx.clinic.timezone;
  const { data: current } = await supabase
    .from("appointments")
    .select("id, branch_id, doctor_id, starts_at, ends_at, status")
    .eq("id", parsed.data.appointmentId)
    .eq("clinic_id", ctx.clinic.id)
    .maybeSingle();
  const appt = current as {
    branch_id: string;
    doctor_id: string;
    starts_at: string;
    ends_at: string;
    status: string;
  } | null;
  if (!appt || appt.status === "cancelled" || appt.status === "completed")
    return { message: "This appointment cannot be moved." };

  const durationMin = Math.round(
    (new Date(appt.ends_at).getTime() - new Date(appt.starts_at).getTime()) / 60_000,
  );
  const startsAt = new Date(parsed.data.startsAt);
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(startsAt);
  const slotCtx = await loadSlotContext(supabase, {
    clinicId: ctx.clinic.id,
    branchId: appt.branch_id,
    doctorId: appt.doctor_id,
    date,
    tz,
    excludeAppointmentId: parsed.data.appointmentId,
  });
  if (!isOpenSlot({ date, tz, durationMin, now: new Date(), ...slotCtx }, parsed.data.startsAt))
    return TAKEN;

  const { data, error } = await supabase
    .from("appointments")
    .update({
      starts_at: startsAt.toISOString(),
      ends_at: new Date(startsAt.getTime() + durationMin * 60_000).toISOString(),
    })
    .eq("id", parsed.data.appointmentId)
    .eq("clinic_id", ctx.clinic.id)
    .select("id");
  if (error?.code === OVERLAP) return TAKEN;
  if (error || !data?.length) return { message: "We could not move that appointment." };

  await logAudit(
    supabase,
    ctx.clinic.id,
    "appointment.rescheduled",
    "appointment",
    parsed.data.appointmentId,
  );
  revalidatePath("/appointments");
  return { ok: true, message: "Appointment moved." };
}

export async function setAppointmentStatusAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await front();
  if (!ctx) return DENIED;
  const parsed = appointmentStatusSchema.safeParse({
    appointmentId: formString(formData, "appointmentId"),
    status: formString(formData, "status"),
    cancelReason: formString(formData, "cancelReason"),
  });
  if (!parsed.success) return validationFailed(parsed.error);

  const supabase = await createClient();
  const patch: Record<string, string | null> = { status: parsed.data.status };
  if (parsed.data.status === "cancelled") patch.cancel_reason = parsed.data.cancelReason ?? null;
  const { data, error } = await supabase
    .from("appointments")
    .update(patch)
    .eq("id", parsed.data.appointmentId)
    .eq("clinic_id", ctx.clinic.id)
    // Only open appointments change status: a stale dialog or double submit must not re-cancel, complete a
    // cancelled visit or draft the same offers twice.
    .in("status", ["scheduled", "confirmed"])
    .select("id");
  if (error?.code === OVERLAP) return TAKEN;
  if (error) return { message: "We could not update that appointment." };
  if (!data?.length)
    return { message: "This appointment was already updated. Reload to see its current status." };

  await logAudit(
    supabase,
    ctx.clinic.id,
    `appointment.${parsed.data.status}`,
    "appointment",
    parsed.data.appointmentId,
  );
  let proposed = 0;
  if (parsed.data.status === "cancelled" || parsed.data.status === "no_show") {
    proposed = await proposeOffers(supabase, {
      clinicId: ctx.clinic.id,
      appointmentId: parsed.data.appointmentId,
      tz: ctx.clinic.timezone,
    });
    if (proposed > 0) revalidatePath("/dr-pill/activity");
  }
  revalidatePath("/appointments");
  return {
    ok: true,
    message:
      proposed > 0
        ? `Updated. Dr. Pill drafted ${proposed} offer${proposed === 1 ? "" : "s"} for the open slot. Review in Activity.`
        : "Updated.",
  };
}

export async function addWaitlistAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await front();
  if (!ctx) return DENIED;
  const doctorId = formString(formData, "doctorId");
  const parsed = waitlistSchema.safeParse({
    patientId: formString(formData, "patientId"),
    doctorId: doctorId === "" ? undefined : doctorId,
    reason: formString(formData, "reason"),
    weekdays: formData.getAll("weekdays").map(String),
    outreachOk: formData.get("outreachOk") === "on",
  });
  if (!parsed.success) return validationFailed(parsed.error, formData, ["reason"]);

  const supabase = await createClient();
  // One active entry per patient: a second one would only double-list them (and double-submit would add twice).
  const { data: existing } = await supabase
    .from("waitlist_entries")
    .select("id")
    .eq("clinic_id", ctx.clinic.id)
    .eq("patient_id", parsed.data.patientId)
    .in("status", ["waiting", "offered"])
    .limit(1);
  if (existing?.length)
    return {
      message: "This patient is already on the waitlist. Remove the old entry first to change it.",
      values: echo(formData, ["reason"]),
    };
  const { data, error } = await supabase
    .from("waitlist_entries")
    .insert({
      clinic_id: ctx.clinic.id,
      patient_id: parsed.data.patientId,
      doctor_id: parsed.data.doctorId ?? null,
      reason: parsed.data.reason ?? null,
      preferred_weekdays: parsed.data.weekdays,
      outreach_ok: parsed.data.outreachOk,
    })
    .select("id");
  if (error || !data?.length)
    return { message: "We could not add to the waitlist.", values: echo(formData, ["reason"]) };

  await logAudit(
    supabase,
    ctx.clinic.id,
    "waitlist.added",
    "waitlist_entry",
    String((data[0] as { id: unknown }).id),
  );
  revalidatePath("/appointments");
  return { ok: true, message: "Added to the waitlist." };
}

export async function removeWaitlistAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await front();
  if (!ctx) return DENIED;
  const id = formString(formData, "entryId");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { message: "Invalid entry." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("waitlist_entries")
    .update({ status: "removed" })
    .eq("id", id)
    .eq("clinic_id", ctx.clinic.id)
    .select("id");
  if (error || !data?.length) return { message: "We could not remove that entry." };
  await logAudit(supabase, ctx.clinic.id, "waitlist.removed", "waitlist_entry", id);
  revalidatePath("/appointments");
  return { ok: true };
}
