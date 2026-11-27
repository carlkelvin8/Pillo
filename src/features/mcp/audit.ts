import { sql } from "drizzle-orm";
import { withMcpClinic } from "./database";
import type { McpAuth } from "./auth";

export async function auditMcpCall(
  auth: McpAuth,
  tool: string,
  outcome: "success" | "failure",
): Promise<void> {
  await withMcpClinic(auth.clinicId, (db) =>
    db
      .execute(
        sql`
      insert into public.audit_log (clinic_id, actor_type, action, entity, entity_id, meta)
      values (${auth.clinicId}, 'mcp', 'mcp.tool_called', 'mcp_token', ${auth.tokenId},
        jsonb_build_object('tool', ${tool}, 'outcome', ${outcome}))
    `,
      )
      .then(() => undefined),
  );
}
