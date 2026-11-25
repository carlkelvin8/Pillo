import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { sanitizeSearch } from "./age";
import {
  patientRowSchema,
  prescriptionRowSchema,
  visitRowSchema,
  type Patient,
  type Prescription,
  type Visit,
} from "./schemas";
import { appointmentRowSchema, type AppointmentRow } from "@/features/scheduling/schemas";

export const PAGE_SIZE = 10;
const PATIENT_COLUMNS =
  "id, patient_number, full_name, birthdate, sex, phone, email, consent_at, created_at";

function check(error: { code?: string } | null, what: string): void {
  if (error) throw new Error(`Could not load ${what} (${error.code ?? "error"})`);
}

export type PatientListFilter = "all" | "new";

export async function listPatients(args: {
  clinicId: string;
  q?: string;
  filter: PatientListFilter;
  page: number;
  /** UTC ISO start of the current month in clinic time; "new" means created on/after this. */
  monthStartIso: string;
}) {
  const supabase = await createClient();
  const from = (args.page - 1) * PAGE_SIZE;
  let query = supabase
    .from("patients")
    .select(PATIENT_COLUMNS, { count: "exact" })
    .eq("clinic_id", args.clinicId)
    .order("full_name", { ascending: true })
    .range(from, from + PAGE_SIZE - 1);
  const q = sanitizeSearch(args.q ?? "");
  if (q) query = query.or(`full_name.ilike.%${q}%,phone.ilike.%${q}%`);
  if (args.filter === "new") query = query.gte("created_at", args.monthStartIso);
  const { data, count, error } = await query;
  check(error, "patients");
  return { rows: z.array(patientRowSchema).parse(data ?? []), total: count ?? 0 };
}

export async function patientStats(clinicId: string, monthStartIso: string) {
  const supabase = await createClient();
  const [all, fresh] = await Promise.all([
    supabase
      .from("patients")
      .select("id", { count: "exact", head: true })
      .eq("clinic_id", clinicId),
    supabase
      .from("patients")
      .select("id", { count: "exact", head: true })
      .eq("clinic_id", clinicId)
      .gte("created_at", monthStartIso),
  ]);
  check(all.error, "patient count");
  check(fresh.error, "patient count");
  return { total: all.count ?? 0, newThisMonth: fresh.count ?? 0 };
}

/** Last completed and next upcoming appointment for a page of patients. */
export async function visitSummaries(clinicId: string, patientIds: string[], nowIso: string) {
  const summary = new Map<string, { last?: string; next?: string }>();
  if (patientIds.length === 0) return summary;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("appointments")
    .select("patient_id, starts_at, status")
    .eq("clinic_id", clinicId)
    .in("patient_id", patientIds)
    .in("status", ["scheduled", "confirmed", "completed"])
    .order("starts_at", { ascending: true });
  check(error, "appointments");
  const rows = z
    .array(z.object({ patient_id: z.string(), starts_at: z.string(), status: z.string() }))
    .parse(data ?? []);
  for (const r of rows) {
    const entry = summary.get(r.patient_id) ?? {};
    if (r.status === "completed" || r.starts_at <= nowIso) entry.last = r.starts_at;
    else if (!entry.next) entry.next = r.starts_at;
    summary.set(r.patient_id, entry);
  }
  return summary;
}

export async function getPatient(clinicId: string, id: string): Promise<Patient | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("patients")
    .select(PATIENT_COLUMNS)
    .eq("clinic_id", clinicId)
    .eq("id", id)
    .maybeSingle();
  check(error, "patient");
  return data ? patientRowSchema.parse(data) : null;
}

export async function patientAppointments(
  clinicId: string,
  patientId: string,
): Promise<AppointmentRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("appointments")
    .select(
      "id, branch_id, doctor_id, patient_id, starts_at, ends_at, reason, status, source, send_reminder",
    )
    .eq("clinic_id", clinicId)
    .eq("patient_id", patientId)
    .order("starts_at", { ascending: false })
    .limit(30);
  check(error, "appointments");
  return z.array(appointmentRowSchema).parse(data ?? []);
}

/** Clinical data. Row Level Security returns nothing unless the caller is an owner or doctor. */
export async function patientClinical(
  clinicId: string,
  patientId: string,
): Promise<{ visits: Visit[]; prescriptions: Prescription[] }> {
  const supabase = await createClient();
  const [visits, rx] = await Promise.all([
    supabase
      .from("visits")
      .select("id, visited_at, title, notes, vitals")
      .eq("clinic_id", clinicId)
      .eq("patient_id", patientId)
      .order("visited_at", { ascending: false })
      .limit(30),
    supabase
      .from("prescriptions")
      .select("id, medication, dosage, active, prescribed_at")
      .eq("clinic_id", clinicId)
      .eq("patient_id", patientId)
      .eq("active", true)
      .order("prescribed_at", { ascending: false }),
  ]);
  check(visits.error, "visits");
  check(rx.error, "prescriptions");
  return {
    visits: z.array(visitRowSchema).parse(visits.data ?? []),
    prescriptions: z.array(prescriptionRowSchema).parse(rx.data ?? []),
  };
}

/** Names for a set of patient ids (calendar blocks, waitlist). */
export async function patientNames(clinicId: string, ids: string[]) {
  const names = new Map<string, { name: string; number: number }>();
  if (ids.length === 0) return names;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("patients")
    .select("id, full_name, patient_number")
    .eq("clinic_id", clinicId)
    .in("id", [...new Set(ids)]);
  check(error, "patients");
  for (const r of z
    .array(z.object({ id: z.string(), full_name: z.string(), patient_number: z.number() }))
    .parse(data ?? [])) {
    names.set(r.id, { name: r.full_name, number: r.patient_number });
  }
  return names;
}
