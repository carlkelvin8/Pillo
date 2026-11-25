import { z } from "zod";
import { isDateString } from "@/lib/datetime";

export const APPOINTMENT_STATUSES = [
  "scheduled",
  "confirmed",
  "completed",
  "cancelled",
  "no_show",
] as const;
export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number];
export const APPOINTMENT_SOURCES = ["staff", "ai", "portal"] as const;
export type AppointmentSource = (typeof APPOINTMENT_SOURCES)[number];
/** Statuses that occupy a doctor's time (mirrors the database exclusion constraint). */
export const ACTIVE_STATUSES = ["scheduled", "confirmed", "completed"] as const;

export const DURATIONS = [15, 30, 45, 60, 90] as const;

export const dateStringSchema = z.string().refine(isDateString, "Choose a date.");

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === "" ? undefined : v))
    .optional();

export const appointmentFormSchema = z.object({
  patientId: z.uuid("Choose a patient."),
  doctorId: z.uuid("Choose a doctor."),
  branchId: z.uuid("Choose a branch."),
  startsAt: z.iso.datetime({ error: "Choose a time." }),
  durationMin: z.coerce.number().int().min(15).max(240),
  reason: optionalText(200),
  sendReminder: z.boolean(),
});

export const rescheduleSchema = z.object({
  appointmentId: z.uuid(),
  startsAt: z.iso.datetime({ error: "Choose a time." }),
});

export const appointmentStatusSchema = z.object({
  appointmentId: z.uuid(),
  status: z.enum(["confirmed", "completed", "no_show", "cancelled"]),
  cancelReason: optionalText(200),
});

export const slotsRequestSchema = z.object({
  doctorId: z.uuid(),
  branchId: z.uuid(),
  date: dateStringSchema,
  durationMin: z.coerce.number().int().min(15).max(240),
  /** When rescheduling, ignore this appointment's own time. */
  excludeAppointmentId: z.uuid().optional(),
});

export const waitlistSchema = z.object({
  patientId: z.uuid("Choose a patient."),
  doctorId: z.uuid().optional(),
  reason: optionalText(200),
  weekdays: z.array(z.coerce.number().int().min(0).max(6)).max(7),
  outreachOk: z.boolean(),
});

/* ---- database rows ---- */

export const branchRowSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  address: z.string().nullable(),
  phone: z.string().nullable(),
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
});
export type Branch = z.infer<typeof branchRowSchema>;

export const clinicHoursRowSchema = z.object({
  id: z.uuid(),
  branch_id: z.uuid(),
  weekday: z.number().int().min(0).max(6),
  opens_at: z.string(),
  closes_at: z.string(),
});

export const doctorRowSchema = z.object({
  id: z.uuid(),
  membership_id: z.uuid().nullable(),
  display_name: z.string(),
  specialty: z.string().nullable(),
  active: z.boolean(),
});
export type Doctor = z.infer<typeof doctorRowSchema>;

export const doctorHoursRowSchema = z.object({
  id: z.uuid(),
  doctor_id: z.uuid(),
  branch_id: z.uuid(),
  weekday: z.number().int().min(0).max(6),
  starts_at: z.string(),
  ends_at: z.string(),
});

export const appointmentRowSchema = z.object({
  id: z.uuid(),
  branch_id: z.uuid(),
  doctor_id: z.uuid(),
  patient_id: z.uuid(),
  starts_at: z.string(),
  ends_at: z.string(),
  reason: z.string().nullable(),
  status: z.enum(APPOINTMENT_STATUSES),
  source: z.enum(APPOINTMENT_SOURCES),
  send_reminder: z.boolean(),
});
export type AppointmentRow = z.infer<typeof appointmentRowSchema>;

export const waitlistRowSchema = z.object({
  id: z.uuid(),
  patient_id: z.uuid(),
  doctor_id: z.uuid().nullable(),
  reason: z.string().nullable(),
  preferred_weekdays: z.array(z.number()),
  outreach_ok: z.boolean(),
  status: z.enum(["waiting", "offered", "booked", "removed"]),
  created_at: z.string(),
});
export type WaitlistRow = z.infer<typeof waitlistRowSchema>;
