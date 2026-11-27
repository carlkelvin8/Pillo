import { sql } from "drizzle-orm";
import { hashToken } from "@/lib/token";
import { withMcpTokenHash } from "./database";
import type { McpScope } from "./scopes";

export type McpAuth = { tokenId: string; clinicId: string; scopes: string[] };

export function bearerToken(header: string | null): string | null {
  const match = header?.match(/^Bearer\s+([A-Za-z0-9_-]{32,128})$/i);
  return match?.[1] ?? null;
}

export async function authenticateMcp(header: string | null): Promise<McpAuth | null> {
  const token = bearerToken(header);
  if (!token) return null;
  const tokenHash = hashToken(token);
  return withMcpTokenHash(tokenHash, async (db) => {
    const rows = await db.execute(sql`
      select id, clinic_id, scopes
      from public.mcp_tokens
      where token_hash = ${tokenHash} and revoked_at is null and expires_at > now()
      limit 1
    `);
    const row = rows[0] as { id: string; clinic_id: string; scopes: string[] } | undefined;
    if (!row) return null;
    await db.execute(sql`select set_config('app.mcp_clinic_id', ${row.clinic_id}, true)`);
    await db.execute(
      sql`update public.mcp_tokens set last_used_at = now() where id = ${row.id} and clinic_id = ${row.clinic_id}`,
    );
    return { tokenId: row.id, clinicId: row.clinic_id, scopes: row.scopes };
  });
}

export const hasScope = (auth: McpAuth, scope: McpScope) => auth.scopes.includes(scope);
