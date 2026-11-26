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
  /** Live patient chat and owner questions. Off unless exactly "true". Keep off until the clinic-data privacy decision is made (CLAUDE.md). */
  LIVE_AI_ENABLED: z.boolean().optional(),
  DATABASE_URL: z.url().optional(),
  /** Connection for the MCP route as the least-privilege `pillo_mcp` role (see the 20261206 migration). */
  DATABASE_URL_MCP: z
    .string()
    .refine((value) => /^postgres(ql)?:\/\//.test(value), "Must start with postgres:// or postgresql://")
    .optional(),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

export function serverEnv(): ServerEnv {
  const raw: Record<string, unknown> = {
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || undefined,
    PAYMONGO_SECRET_KEY: process.env.PAYMONGO_SECRET_KEY || undefined,
    PAYMONGO_WEBHOOK_SECRET: process.env.PAYMONGO_WEBHOOK_SECRET || undefined,
    PAYMENTS_MODE: process.env.PAYMENTS_MODE || undefined,
    GEMINI_API_KEY: process.env.GEMINI_API_KEY || undefined,
    GEMINI_MODEL: process.env.GEMINI_MODEL || undefined,
    LIVE_AI_ENABLED: process.env.LIVE_AI_ENABLED === "true",
    DATABASE_URL: process.env.DATABASE_URL || undefined,
    DATABASE_URL_MCP: process.env.DATABASE_URL_MCP || undefined,
  };
  // Parse each key on its own so one bad value only drops itself.
  const env: Record<string, unknown> = {};
  for (const [key, schema] of Object.entries(serverEnvSchema.shape)) {
    const parsed = schema.safeParse(raw[key]);
    if (parsed.success && parsed.data !== undefined) env[key] = parsed.data;
  }
  return env as ServerEnv;
}
