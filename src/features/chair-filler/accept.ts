import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { clinicWebsiteSchema } from "@/features/clinic/schemas";
import { loadSlotContext } from "@/features/scheduling/queries";
import { isOpenSlot } from "@/features/scheduling/slots";
import { dateOf, formatDateLong, formatTime } from "@/lib/datetime";
import { hashToken } from "@/lib/token";
import { firstName } from "./message";
import { offerState, type OfferState } from "./state";

const OVERLAP = "23P01";

const rowSchema = z.object({
  id: z.uuid(),
  clinic_id: z.uuid(),
  branch_id: z.uuid(),
  doctor_id: z.uuid(),
  patient_id: z.uuid(),
  waitlist_entry_id: z.uuid().nullable(),
  starts_at: z.string(),
  ends_at: z.string(),
  status: z.enum(["proposed", "sent", "accepted", "declined", "expired", "skipped"]),
  expires_at: z.string().nullable(),
});
type OfferRecord = z.infer<typeof rowSchema>;

const branchLocationSchema = z.object({
  name: z.string(),
  address: z.string().nullable(),
  latitude: z.number().min(-90).max(90).nullable(),
  longitude: z.number().min(-180).max(180).nullable(),
});

export type OfferLocation = {
  branch: z.infer<typeof branchLocationSchema> | null;
  websiteUrl: string | null;
};

export type OfferView =
  | { state: "invalid" }
  | {
      state: Exclude<OfferState, "open" | "accepted">;
      clinicName: string;
      status: OfferRecord["status"];
    }
  | ({ state: "accepted"; clinicName: string } & OfferLocation)
  | ({
      state: "open";
      clinicName: string;
      doctorName: string;
      slotLabel: string;
      patientFirstName: string;
    } & OfferLocation);

export type AcceptResult = "accepted" | "taken" | "closed";

/**
 * Patient-facing offer logic. Runs with the service-role client (no session), so every query is
 * scoped by the clinic found from the token's hash. The token is the only credential.
 */
async function find(svc: SupabaseClient, token: string): Promise<OfferRecord | null> {
  if (token.length < 20 || token.length > 100) return null;
  const { data } = await svc
    .from("slot_offers")
    .select(
      "id, clinic_id, branch_id, doctor_id, patient_id, waitlist_entry_id, starts_at, ends_at, status, expires_at",
    )
    .eq("token_hash", hashToken(token))
    .maybeSingle();
  const r = rowSchema.safeParse(data);
  return r.success ? r.data : null;
}

type ClinicInfo = { name: string; timezone: string; websiteUrl: string | null };

/** Strict lookup: null when the clinic (and so its timezone) cannot be loaded. */
async function loadClinic(svc: SupabaseClient, clinicId: string): Promise<ClinicInfo | null> {
  let { data, error } = await svc
    .from("clinics")
    .select("name, timezone, website_url")
    .eq("id", clinicId)
    .maybeSingle();
  // Offers remain usable while the optional website_url migration is pending.
  if (error?.code === "42703") {
    ({ data, error } = await svc
      .from("clinics")
      .select("name, timezone")
      .eq("id", clinicId)
      .maybeSingle());
  }
  if (error) return null;
  const c = z.object({ name: z.string(), timezone: z.string() }).safeParse(data);
  if (!c.success) return null;
  return {
    name: c.data.name,
    timezone: c.data.timezone,
    websiteUrl: clinicWebsiteSchema.safeParse(data?.website_url).data ?? null,
  };
}

/** Lenient lookup for display only: falls back to defaults. */
async function clinicOf(svc: SupabaseClient, clinicId: string): Promise<ClinicInfo> {
  return (
    (await loadClinic(svc, clinicId)) ?? {
      name: "the clinic",
      timezone: "Asia/Manila",
      websiteUrl: null,
    }
  );
}

function logFailure(label: string, error: { code?: string } | null | undefined) {
  if (error) console.error(label, error.code ?? "unknown");
}

async function branchOf(svc: SupabaseClient, offer: OfferRecord) {
  const { data } = await svc
    .from("branches")
    .select("name, address, latitude, longitude")
    .eq("clinic_id", offer.clinic_id)
    .eq("id", offer.branch_id)
    .maybeSingle();
  return branchLocationSchema.safeParse(data).data ?? null;
}

export async function viewOffer(
  svc: SupabaseClient,
  token: string,
  now = new Date(),
): Promise<OfferView> {
  const o = await find(svc, token);
  if (!o) return { state: "invalid" };
  const state = offerState(o, now);
  const [clinic, branch] = await Promise.all([
    clinicOf(svc, o.clinic_id),
    state === "open" || state === "accepted" ? branchOf(svc, o) : null,
  ]);
  if (state === "closed" || state === "expired")
    return { state, clinicName: clinic.name, status: o.status };
  const location: OfferLocation = { branch, websiteUrl: clinic.websiteUrl };
  if (state === "accepted") return { state, clinicName: clinic.name, ...location };
  const [{ data: d }, { data: p }] = await Promise.all([
    svc
      .from("doctors")
      .select("display_name")
      .eq("clinic_id", o.clinic_id)
      .eq("id", o.doctor_id)
      .maybeSingle(),
    svc
      .from("patients")
      .select("full_name")
      .eq("clinic_id", o.clinic_id)
      .eq("id", o.patient_id)
      .maybeSingle(),
  ]);
  return {
    state: "open",
    clinicName: clinic.name,
    ...location,
    doctorName:
      z.object({ display_name: z.string() }).safeParse(d).data?.display_name ?? "the doctor",
    patientFirstName: firstName(
      z.object({ full_name: z.string() }).safeParse(p).data?.full_name ?? "",
    ),
    slotLabel: `${formatDateLong(dateOf(o.starts_at, clinic.timezone))}, ${formatTime(o.starts_at, clinic.timezone)}`,
  };
}

export async function acceptOffer(
  svc: SupabaseClient,
  token: string,
  now = new Date(),
): Promise<AcceptResult> {
  const o = await find(svc, token);
  if (!o || offerState(o, now) !== "open") return "closed";
  // The timezone decides whether the slot is still open: never guess it.
  const clinic = await loadClinic(svc, o.clinic_id);
  if (!clinic) return "closed";

  // 1. Claim the offer atomically: only one request can move it from sent to accepted.
  const { data: claimed } = await svc
    .from("slot_offers")
    .update({ status: "accepted" })
    .eq("id", o.id)
    .eq("clinic_id", o.clinic_id)
    .eq("status", "sent")
    .select("id");
  if (!claimed?.length) return "closed";

  const release = async () => {
    await svc
      .from("slot_offers")
      .update({ status: "expired" })
      .eq("id", o.id)
      .eq("clinic_id", o.clinic_id);
    await record(svc, o, "failed", "Slot was no longer available");
  };

  let apptId: string;
  try {
    // 2. The slot must still be open (hours, doctor schedule, other bookings).
    const date = dateOf(o.starts_at, clinic.timezone);
    const ctx = await loadSlotContext(svc, {
      clinicId: o.clinic_id,
      branchId: o.branch_id,
      doctorId: o.doctor_id,
      date,
      tz: clinic.timezone,
    });
    const durationMin = Math.round(
      (new Date(o.ends_at).getTime() - new Date(o.starts_at).getTime()) / 60_000,
    );
    if (!isOpenSlot({ date, tz: clinic.timezone, durationMin, ...ctx, now }, o.starts_at)) {
      await release();
      return "taken";
    }

    // 3. Book it. The database exclusion constraint is the final guard against double-booking.
    const { data: appt, error } = await svc
      .from("appointments")
      .insert({
        clinic_id: o.clinic_id,
        branch_id: o.branch_id,
        patient_id: o.patient_id,
        doctor_id: o.doctor_id,
        starts_at: o.starts_at,
        ends_at: o.ends_at,
        reason: "Offered slot (Chair-Filler)",
        status: "scheduled",
        source: "ai",
        send_reminder: true,
      })
      .select("id")
      .single();
    if (error || !appt) {
      await release();
      return error?.code === OVERLAP ? "taken" : "closed";
    }
    apptId = String((appt as { id: unknown }).id);
  } catch {
    try {
      await release();
    } catch {
      console.error("chair_filler.release_failed");
    }
    return "closed";
  }

  // The booking exists: later write failures are logged (code only) but never undo it.
  const writes = await Promise.all([
    svc
      .from("slot_offers")
      .update({ filled_appointment_id: apptId })
      .eq("id", o.id)
      .eq("clinic_id", o.clinic_id),
    // Same slot offered to others is no longer available.
    svc
      .from("slot_offers")
      .update({ status: "expired" })
      .eq("clinic_id", o.clinic_id)
      .eq("doctor_id", o.doctor_id)
      .eq("starts_at", o.starts_at)
      .in("status", ["proposed", "sent"]),
    o.waitlist_entry_id
      ? svc
          .from("waitlist_entries")
          .update({ status: "booked" })
          .eq("id", o.waitlist_entry_id)
          .eq("clinic_id", o.clinic_id)
      : Promise.resolve({ error: null }),
    svc.from("audit_log").insert({
      clinic_id: o.clinic_id,
      actor_type: "ai",
      action: "appointment.created",
      entity: "appointment",
      entity_id: apptId,
      meta: { via: "chair_filler" },
    }),
  ]);
  const labels = [
    "chair_filler.link_appointment_failed",
    "chair_filler.expire_siblings_failed",
    "chair_filler.waitlist_update_failed",
    "chair_filler.audit_failed",
  ];
  writes.forEach((w, i) => logFailure(labels[i] ?? "chair_filler.write_failed", w?.error));
  await record(svc, o, "executed", "Filled an open slot", apptId);
  return "accepted";
}

export async function declineOffer(
  svc: SupabaseClient,
  token: string,
  now = new Date(),
): Promise<void> {
  const o = await find(svc, token);
  if (!o || offerState(o, now) !== "open") return;
  await svc
    .from("slot_offers")
    .update({ status: "declined" })
    .eq("id", o.id)
    .eq("clinic_id", o.clinic_id)
    .eq("status", "sent");
}

/** The activity log: ids only, no names or contact details. */
async function record(
  svc: SupabaseClient,
  o: OfferRecord,
  status: "executed" | "failed",
  outcome: string,
  appointmentId?: string,
) {
  await svc.from("agent_actions").insert({
    clinic_id: o.clinic_id,
    kind: "chair_filler",
    status,
    autonomy: "approve",
    payload: { offer_id: o.id, ...(appointmentId ? { appointment_id: appointmentId } : {}) },
    outcome,
  });
}
