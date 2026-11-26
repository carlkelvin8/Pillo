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

const websiteError = "Enter a website URL beginning with https:// or http://.";
export const clinicWebsiteSchema = z
  .string()
  .trim()
  .max(2048)
  .regex(/^https?:\/\/[^\s\\]+$/i, websiteError)
  .pipe(z.url({ protocol: /^https?$/, error: websiteError }))
  .refine((value) => {
    const url = new URL(value);
    return !url.username && !url.password;
  }, "Remove credentials from the website URL.");

export const clinicProfileSchema = clinicDetailsSchema.extend({
  websiteUrl: z
    .union(
      [
        z
          .string()
          .trim()
          .length(0)
          .transform(() => null),
        clinicWebsiteSchema,
      ],
      {
        error: websiteError,
      },
    )
    .optional(),
});

/** A clinic row as returned by PostgREST. */
export const clinicRowSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  address: z.string().nullable(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  timezone: z.string(),
  logo_path: z.string().nullable().optional(),
  assistant_settings: assistantSettingsSchema,
  onboarding_completed_at: z.string().nullable(),
});
export type Clinic = z.infer<typeof clinicRowSchema>;
