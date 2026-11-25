import { createClient } from "@supabase/supabase-js";
import { serverEnv } from "@/lib/env-server";
import { publicEnv } from "@/lib/env";

/**
 * Service-role client: BYPASSES Row Level Security. Use ONLY in code with no user session
 * (webhooks, scheduled jobs) and always scope by an explicit clinic. Never import from a
 * component or from an action that acts on behalf of a signed-in user.
 */
export function createServiceClient() {
  const key = serverEnv().SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  return createClient(publicEnv().NEXT_PUBLIC_SUPABASE_URL, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
