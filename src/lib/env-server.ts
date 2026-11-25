import { z } from "zod";

/** Server-only secrets. Every value is optional: features that need one explain what is missing. */
const serverEnvSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
  PAYMONGO_SECRET_KEY: z.string().min(1).optional(),
  PAYMONGO_WEBHOOK_SECRET: z.string().min(1).optional(),
  /** "mock" enables fake payment links for local development. Ignored in production. */
  PAYMENTS_MODE: z.enum(["mock", "paymongo"]).optional(),
  GEMINI_API_KEY: z.string().min(1).optional(),
  GEMINI_MODEL: z.string().min(1).optional(),
  DATABASE_URL: z.url().optional(),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

export function serverEnv(): ServerEnv {
  const parsed = serverEnvSchema.safeParse({
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || undefined,
    PAYMONGO_SECRET_KEY: process.env.PAYMONGO_SECRET_KEY || undefined,
    PAYMONGO_WEBHOOK_SECRET: process.env.PAYMONGO_WEBHOOK_SECRET || undefined,
    PAYMENTS_MODE: process.env.PAYMENTS_MODE || undefined,
    GEMINI_API_KEY: process.env.GEMINI_API_KEY || undefined,
    GEMINI_MODEL: process.env.GEMINI_MODEL || undefined,
    DATABASE_URL: process.env.DATABASE_URL || undefined,
  });
  return parsed.success ? parsed.data : {};
}
