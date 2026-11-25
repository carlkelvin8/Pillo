import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Append an audit entry via the log_audit() RPC (runs as the signed-in member).
 * `meta` must never contain patient names or contact details (RA 10173).
 */
export async function logAudit(
  supabase: SupabaseClient,
  clinicId: string,
  action: string,
  entity: string,
  entityId: string | null = null,
  meta: Record<string, string | number | boolean | null> = {},
): Promise<void> {
  const { error } = await supabase.rpc("log_audit", {
    p_clinic_id: clinicId,
    p_action: action,
    p_entity: entity,
    p_entity_id: entityId,
    p_meta: meta,
  });
  // Log only the error code: messages could echo input.
  if (error) console.error("audit log write failed", { action, code: error.code });
}
