import { sql } from "drizzle-orm";
import { mcpDatabase } from "./database";
import type { McpAuth } from "./auth";

export async function auditMcpCall(
  auth: McpAuth,
  tool: string,
  outcome: "success" | "failure",
): Promise<void> {
  await mcpDatabase().execute(sql`
    insert into public.audit_log (clinic_id, actor_type, action, entity, entity_id, meta)
    values (${auth.clinicId}, 'mcp', 'mcp.tool_called', 'mcp_token', ${auth.tokenId},
      jsonb_build_object('tool', ${tool}, 'outcome', ${outcome}))
  `);
}
