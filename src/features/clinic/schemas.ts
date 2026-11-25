import { z } from "zod";
import { assistantSettingsSchema } from "@/features/assistant/settings";
import { emailSchema } from "@/features/auth/schemas";

/** Empty string -> undefined so optional inputs can be left blank. */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === "" ? undefined : v))
    .optional();

export const clinicDetailsSchema = z.object({
  name: z.string().trim().min(1, "Enter the clinic name.").max(120),
  address: optionalText(300),
  phone: optionalText(40),
  email: z
    .union([z.literal(""), emailSchema])
    .transform((v) => (v === "" ? undefined : v))
    .optional(),
});
export type ClinicDetails = z.infer<typeof clinicDetailsSchema>;

/** A clinic row as returned by PostgREST. */
export const clinicRowSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  address: z.string().nullable(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  timezone: z.string(),
  assistant_settings: assistantSettingsSchema,
  onboarding_completed_at: z.string().nullable(),
});
export type Clinic = z.infer<typeof clinicRowSchema>;
