import { z } from "zod";
import { emailSchema } from "@/features/auth/schemas";
import { isDateString } from "@/lib/datetime";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === "" ? undefined : v))
    .optional();

/** Empty input -> undefined; otherwise a number inside [min, max]. */
const optionalNumber = (min: number, max: number, label: string) =>
  z
    .string()
    .trim()
    .transform((v) => (v === "" ? undefined : Number(v)))
    .pipe(
      z
        .number({ error: `${label} must be a number.` })
        .min(min, `${label} is too low.`)
        .max(max, `${label} is too high.`)
        .optional(),
    );

export const SEXES = ["female", "male", "other"] as const;

export const patientFormSchema = z.object({
  fullName: z.string().trim().min(1, "Enter the patient's name.").max(120),
  birthdate: z
    .string()
    .trim()
    .transform((v) => (v === "" ? undefined : v))
    .pipe(
      z
        .string()
        .refine(isDateString, "Enter a valid date.")
        .refine(
          (v) => v >= "1900-01-01" && v <= new Date().toISOString().slice(0, 10),
          "Birthdate cannot be in the future.",
        )
        .optional(),
    ),
  sex: z
    .string()
    .transform((v) => (v === "" ? undefined : v))
    .pipe(z.enum(SEXES).optional()),
  phone: optionalText(40),
  email: z
    .union([z.literal(""), emailSchema])
    .transform((v) => (v === "" ? undefined : v))
    .optional(),
  consent: z.boolean(),
});

export const vitalsSchema = z.object({
  bp_systolic: optionalNumber(40, 300, "Systolic").optional(),
  bp_diastolic: optionalNumber(20, 200, "Diastolic").optional(),
  heart_rate: optionalNumber(20, 250, "Heart rate").optional(),
  weight_kg: optionalNumber(1, 500, "Weight").optional(),
  temp_c: optionalNumber(30, 45, "Temperature").optional(),
});
export type Vitals = {
  bp_systolic?: number;
  bp_diastolic?: number;
  heart_rate?: number;
  weight_kg?: number;
  temp_c?: number;
};

/** Vitals as stored in visits.vitals (numbers only, all optional). */
export const storedVitalsSchema = z
  .object({
    bp_systolic: z.number().optional(),
    bp_diastolic: z.number().optional(),
    heart_rate: z.number().optional(),
    weight_kg: z.number().optional(),
    temp_c: z.number().optional(),
  })
  .catch({});

export const visitFormSchema = z.object({
  patientId: z.uuid(),
  title: optionalText(120),
  notes: optionalText(4000),
  vitals: vitalsSchema,
});

export const prescriptionFormSchema = z.object({
  patientId: z.uuid(),
  medication: z.string().trim().min(1, "Enter the medication.").max(120),
  dosage: optionalText(120),
});

export const patientRowSchema = z.object({
  id: z.uuid(),
  patient_number: z.number().int(),
  full_name: z.string(),
  birthdate: z.string().nullable(),
  sex: z.enum(SEXES).nullable(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  consent_at: z.string().nullable(),
  created_at: z.string(),
});
export type Patient = z.infer<typeof patientRowSchema>;

export const visitRowSchema = z.object({
  id: z.uuid(),
  visited_at: z.string(),
  title: z.string().nullable(),
  notes: z.string().nullable(),
  vitals: storedVitalsSchema,
});
export type Visit = z.infer<typeof visitRowSchema>;

export const prescriptionRowSchema = z.object({
  id: z.uuid(),
  medication: z.string(),
  dosage: z.string().nullable(),
  active: z.boolean(),
  prescribed_at: z.string(),
});
export type Prescription = z.infer<typeof prescriptionRowSchema>;
