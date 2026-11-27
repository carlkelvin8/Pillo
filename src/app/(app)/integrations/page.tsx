import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { requireCapability } from "@/features/auth/workspace";
import { projectMcpActivity } from "@/features/mcp/activity";
import { IntegrationsOverview } from "@/features/mcp/components/integrations-overview";
import { TokenManager } from "@/features/mcp/components/token-manager";
import { APP_NAME } from "@/config/brand";
import { mcpDatabaseConfigured } from "@/features/mcp/database";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Integrations" };

export default async function Page() {
  const { membership } = await requireCapability("integrations.manage");
  const supabase = await createClient();
  const [tokenResult, activityResult] = await Promise.all([
    supabase.from("mcp_tokens")
      .select("id, name, scopes, created_at, last_used_at, revoked_at, expires_at")
      .eq("clinic_id", membership.clinic.id).order("created_at", { ascending: false }),
    supabase.from("audit_log").select("at, action, meta")
      .eq("clinic_id", membership.clinic.id).like("action", "mcp.%")
      .order("at", { ascending: false }).limit(6),
  ]);
  if (tokenResult.error) throw new Error(`Could not load MCP tokens (${tokenResult.error.code})`);
  const tokens = (tokenResult.data ?? []).map((row) => ({
    id: String(row.id), name: String(row.name), scopes: Array.isArray(row.scopes) ? row.scopes.map(String) : [],
    created_at: String(row.created_at), last_used_at: row.last_used_at ? String(row.last_used_at) : null,
    revoked_at: row.revoked_at ? String(row.revoked_at) : null,
    expires_at: String(row.expires_at),
  }));
  const activity = projectMcpActivity(activityResult.data ?? []);
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const endpoint = new URL("/api/mcp", baseUrl).toString();
  return <>
    <PageHeader eyebrow={`${APP_NAME} · MCP`} title="Integrations" />
    <IntegrationsOverview endpoint={endpoint} databaseConfigured={mcpDatabaseConfigured()} activity={activity} activityUnavailable={Boolean(activityResult.error)} timezone={membership.clinic.timezone} />
    <TokenManager tokens={tokens} timezone={membership.clinic.timezone} />
  </>;
}
