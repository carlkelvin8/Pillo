import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const offerRowSchema = z.object({
  id: z.uuid(),
  status: z.enum(["proposed", "sent", "accepted", "declined", "expired", "skipped"]),
  starts_at: z.string(),
  ends_at: z.string(),
  expires_at: z.string().nullable(),
  created_at: z.string(),
  patient: z.object({ full_name: z.string() }).nullable(),
  doctor: z.object({ display_name: z.string() }).nullable(),
});
export type OfferRow = z.infer<typeof offerRowSchema>;

/** Recent offers for staff review (owner and receptionist only, enforced by RLS). */
export async function listOffers(clinicId: string): Promise<OfferRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("slot_offers")
    .select(
      "id, status, starts_at, ends_at, expires_at, created_at, patient:patients(full_name), doctor:doctors(display_name)",
    )
    .eq("clinic_id", clinicId)
    .order("created_at", { ascending: false })
    .limit(30);
  if (error) throw new Error(`Could not load offers (${error.code})`);
  return z.array(offerRowSchema).parse(data ?? []);
}

export type ChairFillerSummary = {
  filled: number;
  kept: number;
  avgVisitCentavos: number | null;
  /** ESTIMATE: kept (completed) filled appointments x the typical visit value the owner entered. */
  recoveredCentavos: number | null;
};

export function estimateRecovered(kept: number, avgVisitCentavos: number | null): number | null {
  return avgVisitCentavos === null ? null : kept * avgVisitCentavos;
}

export async function getChairFillerSummary(clinicId: string): Promise<ChairFillerSummary> {
  const supabase = await createClient();
  const [{ data: clinic }, { data: offers }] = await Promise.all([
    supabase.from("clinics").select("avg_visit_value_centavos").eq("id", clinicId).maybeSingle(),
    supabase
      .from("slot_offers")
      .select("filled_appointment_id")
      .eq("clinic_id", clinicId)
      .eq("status", "accepted")
      .not("filled_appointment_id", "is", null),
  ]);
  const raw = (clinic as { avg_visit_value_centavos?: unknown } | null)?.avg_visit_value_centavos;
  const avg = raw === null || raw === undefined ? null : Number(raw);
  const ids = z
    .array(z.object({ filled_appointment_id: z.uuid() }))
    .parse(offers ?? [])
    .map((o) => o.filled_appointment_id);
  let kept = 0;
  if (ids.length > 0) {
    const { count } = await supabase
      .from("appointments")
      .select("id", { count: "exact", head: true })
      .eq("clinic_id", clinicId)
      .eq("status", "completed")
      .in("id", ids);
    kept = count ?? 0;
  }
  return {
    filled: ids.length,
    kept,
    avgVisitCentavos: avg,
    recoveredCentavos: estimateRecovered(kept, avg),
  };
}
