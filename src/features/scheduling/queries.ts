import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import {
  ACTIVE_STATUSES,
  appointmentRowSchema,
  branchRowSchema,
  clinicHoursRowSchema,
  doctorHoursRowSchema,
  doctorRowSchema,
  waitlistRowSchema,
  type AppointmentRow,
  type Branch,
  type Doctor,
  type WaitlistRow,
} from "./schemas";
import { dayBoundsUtc } from "@/lib/datetime";
import type { HourWindow } from "./slots";
import { countAppointmentStartsByMonth } from "./dashboard-trend";

function check(error: { code?: string } | null, what: string): void {
  if (error) throw new Error(`Could not load ${what} (${error.code ?? "error"})`);
}

export async function listBranches(clinicId: string): Promise<Branch[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("branches")
    .select("id, name, address, phone, latitude, longitude")
    .eq("clinic_id", clinicId)
    .order("created_at", { ascending: true });
  check(error, "branches");
  return z.array(branchRowSchema).parse(data ?? []);
}

export async function listDoctors(
  clinicId: string,
  opts: { activeOnly?: boolean } = {},
): Promise<Doctor[]> {
  const supabase = await createClient();
  let query = supabase
    .from("doctors")
    .select("id, membership_id, display_name, specialty, active")
    .eq("clinic_id", clinicId)
    .order("display_name", { ascending: true });
  if (opts.activeOnly) query = query.eq("active", true);
  const { data, error } = await query;
  check(error, "doctors");
  return z.array(doctorRowSchema).parse(data ?? []);
}

export type ClinicHoursRow = z.infer<typeof clinicHoursRowSchema>;

export async function listClinicHours(clinicId: string): Promise<ClinicHoursRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("clinic_hours")
    .select("id, branch_id, weekday, opens_at, closes_at")
    .eq("clinic_id", clinicId)
    .order("weekday", { ascending: true });
  check(error, "clinic hours");
  return z.array(clinicHoursRowSchema).parse(data ?? []);
}

export const toBranchWindows = (rows: ClinicHoursRow[], branchId: string): HourWindow[] =>
  rows
    .filter((r) => r.branch_id === branchId)
    .map((r) => ({ weekday: r.weekday, start: r.opens_at, end: r.closes_at }));

export async function listDoctorHours(clinicId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("doctor_hours")
    .select("id, doctor_id, branch_id, weekday, starts_at, ends_at")
    .eq("clinic_id", clinicId);
  check(error, "doctor hours");
  return z.array(doctorHoursRowSchema).parse(data ?? []);
}

/** Appointments whose start falls in [fromIso, toIso). Cancelled ones are excluded unless asked for. */
export async function listAppointments(
  clinicId: string,
  opts: { fromIso: string; toIso: string; branchId?: string; includeCancelled?: boolean },
): Promise<AppointmentRow[]> {
  const supabase = await createClient();
  let query = supabase
    .from("appointments")
    .select(
      "id, branch_id, doctor_id, patient_id, starts_at, ends_at, reason, status, source, send_reminder",
    )
    .eq("clinic_id", clinicId)
    .gte("starts_at", opts.fromIso)
    .lt("starts_at", opts.toIso)
    .order("starts_at", { ascending: true });
  if (opts.branchId) query = query.eq("branch_id", opts.branchId);
  if (!opts.includeCancelled) query = query.neq("status", "cancelled");
  const { data, error } = await query;
  check(error, "appointments");
  return z.array(appointmentRowSchema).parse(data ?? []);
}

/** Monthly appointment counts without loading patient or appointment details. */
export async function monthlyAppointmentCounts(
  clinicId: string,
  fromIso: string,
  toIso: string,
  timezone: string,
): Promise<Map<string, number>> {
  const supabase = await createClient();
  const startsAt: string[] = [];
  const pageSize = 1_000;
  let offset = 0;

  while (true) {
    const { data, error } = await supabase
      .from("appointments")
      .select("starts_at")
      .eq("clinic_id", clinicId)
      .neq("status", "cancelled")
      .gte("starts_at", fromIso)
      .lt("starts_at", toIso)
      .order("starts_at", { ascending: true })
      .range(offset, offset + pageSize - 1);
    check(error, "appointment trend");
    const page = z.array(z.object({ starts_at: z.string() })).parse(data ?? []);
    startsAt.push(...page.map((appointment) => appointment.starts_at));
    if (page.length < pageSize) break;
    offset += pageSize;
  }

  return countAppointmentStartsByMonth(startsAt, timezone);
}

export async function listWaitlist(clinicId: string): Promise<WaitlistRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("waitlist_entries")
    .select(
      "id, patient_id, doctor_id, reason, preferred_weekdays, outreach_ok, status, created_at",
    )
    .eq("clinic_id", clinicId)
    .in("status", ["waiting", "offered"])
    .order("created_at", { ascending: true });
  check(error, "waitlist");
  return z.array(waitlistRowSchema).parse(data ?? []);
}

/** Everything generateSlots needs for one doctor, branch and clinic-local day. */
export async function loadSlotContext(
  supabase: SupabaseClient,
  args: {
    clinicId: string;
    branchId: string;
    doctorId: string;
    date: string;
    tz: string;
    excludeAppointmentId?: string;
  },
) {
  const { start, end } = dayBoundsUtc(args.date, args.tz);
  const [hours, docHours, busy] = await Promise.all([
    supabase
      .from("clinic_hours")
      .select("weekday, opens_at, closes_at")
      .eq("clinic_id", args.clinicId)
      .eq("branch_id", args.branchId),
    supabase
      .from("doctor_hours")
      .select("weekday, starts_at, ends_at")
      .eq("clinic_id", args.clinicId)
      .eq("branch_id", args.branchId)
      .eq("doctor_id", args.doctorId),
    supabase
      .from("appointments")
      .select("id, starts_at, ends_at")
      .eq("clinic_id", args.clinicId)
      .eq("doctor_id", args.doctorId)
      .in("status", [...ACTIVE_STATUSES])
      // Overlap with the day (an appointment can start before midnight in UTC terms).
      .lt("starts_at", end)
      .gt("ends_at", start),
  ]);
  for (const r of [hours, docHours, busy]) check(r.error, "availability");

  const branchHours = z
    .array(z.object({ weekday: z.number(), opens_at: z.string(), closes_at: z.string() }))
    .parse(hours.data ?? [])
    .map((h): HourWindow => ({ weekday: h.weekday, start: h.opens_at, end: h.closes_at }));
  const doctorHours = z
    .array(z.object({ weekday: z.number(), starts_at: z.string(), ends_at: z.string() }))
    .parse(docHours.data ?? [])
    .map((h): HourWindow => ({ weekday: h.weekday, start: h.starts_at, end: h.ends_at }));
  const booked = z
    .array(z.object({ id: z.string(), starts_at: z.string(), ends_at: z.string() }))
    .parse(busy.data ?? [])
    .filter((b) => b.id !== args.excludeAppointmentId)
    .map((b) => ({ startsAt: b.starts_at, endsAt: b.ends_at }));

  return { branchHours, doctorHours, booked };
}
