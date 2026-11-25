import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { rankCandidates, type WaitlistCandidate } from "./rank";

export const DEFAULT_OFFER_LIMIT = 10;

const apptSchema = z.object({
  id: z.uuid(),
  patient_id: z.uuid(),
  doctor_id: z.uuid(),
  branch_id: z.uuid(),
  starts_at: z.string(),
  ends_at: z.string(),
});
const waitSchema = z.object({
  id: z.uuid(),
  patient_id: z.uuid(),
  branch_id: z.uuid().nullable(),
  doctor_id: z.uuid().nullable(),
  preferred_weekdays: z.array(z.number()),
  earliest_time: z.string().nullable(),
  latest_time: z.string().nullable(),
  created_at: z.string(),
});

/**
 * After a cancellation or no-show, queue offers for the best waitlist matches. Runs as the signed-in
 * user (RLS applies). Offers start as "proposed": nothing reaches a patient until staff approve it.
 * Returns how many offers were proposed. Never throws: a failure here must not block the cancel.
 */
export async function proposeOffers(
  supabase: SupabaseClient,
  args: { clinicId: string; appointmentId: string; tz: string; now?: Date },
): Promise<number> {
  try {
    const now = args.now ?? new Date();
    const { data: a } = await supabase
      .from("appointments")
      .select("id, patient_id, doctor_id, branch_id, starts_at, ends_at")
      .eq("clinic_id", args.clinicId)
      .eq("id", args.appointmentId)
      .maybeSingle();
    const appt = apptSchema.safeParse(a);
    if (!appt.success) return 0;
    const slot = appt.data;

    const { data: rule } = await supabase
      .from("agent_rules")
      .select("daily_limit")
      .eq("clinic_id", args.clinicId)
      .eq("kind", "chair_filler")
      .maybeSingle();
    const limit = typeof rule?.daily_limit === "number" ? rule.daily_limit : DEFAULT_OFFER_LIMIT;
    const dayAgo = new Date(now.getTime() - 24 * 3600_000).toISOString();
    const { count } = await supabase
      .from("slot_offers")
      .select("id", { count: "exact", head: true })
      .eq("clinic_id", args.clinicId)
      .gte("created_at", dayAgo);
    const room = limit - (count ?? 0);
    if (room <= 0) return 0;

    const { data: w } = await supabase
      .from("waitlist_entries")
      .select(
        "id, patient_id, branch_id, doctor_id, preferred_weekdays, earliest_time, latest_time, created_at",
      )
      .eq("clinic_id", args.clinicId)
      .eq("status", "waiting")
      .eq("outreach_ok", true);
    const rows = z.array(waitSchema).parse(w ?? []);
    if (rows.length === 0) return 0;
    const ids = [...new Set(rows.map((r) => r.patient_id))];

    const [{ data: pts }, { data: busy }] = await Promise.all([
      supabase
        .from("patients")
        .select("id, consent_at")
        .eq("clinic_id", args.clinicId)
        .in("id", ids),
      supabase
        .from("appointments")
        .select("patient_id, starts_at, ends_at")
        .eq("clinic_id", args.clinicId)
        .in("patient_id", ids)
        .in("status", ["scheduled", "confirmed", "arrived"])
        .lt("starts_at", slot.ends_at)
        .gt("ends_at", slot.starts_at),
    ]);
    const consented = new Set((pts ?? []).filter((p) => p.consent_at).map((p) => p.id as string));
    const busyBy = new Map<string, { startsAt: string; endsAt: string }[]>();
    for (const b of busy ?? []) {
      const list = busyBy.get(b.patient_id as string) ?? [];
      list.push({ startsAt: b.starts_at as string, endsAt: b.ends_at as string });
      busyBy.set(b.patient_id as string, list);
    }

    const candidates: WaitlistCandidate[] = rows.map((r) => ({
      id: r.id,
      patientId: r.patient_id,
      branchId: r.branch_id,
      doctorId: r.doctor_id,
      weekdays: r.preferred_weekdays,
      earliest: r.earliest_time,
      latest: r.latest_time,
      createdAt: r.created_at,
    }));
    const picked = rankCandidates({
      slot: {
        branchId: slot.branch_id,
        doctorId: slot.doctor_id,
        startsAt: slot.starts_at,
        endsAt: slot.ends_at,
      },
      tz: args.tz,
      now,
      waitlist: candidates,
      consentedPatientIds: consented,
      busyByPatient: busyBy,
      excludePatientIds: new Set([slot.patient_id]),
      max: Math.min(3, room),
    });
    if (picked.length === 0) return 0;

    const { data: inserted, error: insertError } = await supabase
      .from("slot_offers")
      .upsert(
        picked.map((c) => ({
          clinic_id: args.clinicId,
          source_appointment_id: slot.id,
          branch_id: slot.branch_id,
          doctor_id: slot.doctor_id,
          patient_id: c.patientId,
          waitlist_entry_id: c.id,
          starts_at: slot.starts_at,
          ends_at: slot.ends_at,
        })),
        { onConflict: "clinic_id,doctor_id,starts_at,patient_id", ignoreDuplicates: true },
      )
      .select("id");
    if (insertError) {
      console.error(`chair-filler: could not save offers (${insertError.code})`);
      return 0;
    }
    return inserted?.length ?? 0;
  } catch (e) {
    console.error("chair-filler: proposeOffers failed", e instanceof Error ? e.name : "unknown");
    return 0;
  }
}
