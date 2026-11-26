"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { logAudit } from "@/features/audit/log";
import { can } from "@/features/auth/permissions";
import { getWorkspace } from "@/features/auth/workspace";
import { formString, type ActionState } from "@/lib/action-state";
import { createClient } from "@/lib/supabase/server";
import { hashToken, newToken } from "@/lib/token";
import { MCP_SCOPES } from "./scopes";
import { expiryFromChoice, MCP_EXPIRY_DAYS } from "./expiry";

const DENIED: ActionState = { message: "Only the clinic owner can manage MCP tokens." };

async function owner() {
  const ws = await getWorkspace();
  if (!ws?.membership || !can(ws.membership.role, "integrations.manage")) return null;
  return { clinicId: ws.membership.clinic.id, userId: ws.user.id };
}

export async function createMcpTokenAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await owner();
  if (!ctx) return DENIED;
  const parsed = z
    .object({
      name: z.string().trim().min(1).max(80),
      scopes: z.array(z.enum(MCP_SCOPES)).max(MCP_SCOPES.length),
      expiresInDays: z.coerce
        .number()
        .pipe(
          z.union(
            MCP_EXPIRY_DAYS.map((d) => z.literal(d)) as [
              z.ZodLiteral<number>,
              z.ZodLiteral<number>,
              z.ZodLiteral<number>,
            ],
          ),
        ),
    })
    .safeParse({
      name: formString(formData, "name"),
      scopes: formData.getAll("scopes").map(String),
      expiresInDays: formString(formData, "expiresInDays") || "90",
    });
  if (!parsed.success) return { message: "Enter a name and choose valid scopes." };
  const token = newToken();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("mcp_tokens")
    .insert({
      clinic_id: ctx.clinicId,
      name: parsed.data.name,
      token_hash: hashToken(token),
      scopes: parsed.data.scopes,
      expires_at: expiryFromChoice(parsed.data.expiresInDays).toISOString(),
      created_by: ctx.userId,
    })
    .select("id")
    .maybeSingle();
  if (error || !data) return { message: "We could not create that token." };
  await logAudit(supabase, ctx.clinicId, "mcp.token_created", "mcp_token", data.id, {
    scopes: parsed.data.scopes.join(","),
    expiresInDays: parsed.data.expiresInDays,
  });
  revalidatePath("/integrations");
  return {
    ok: true,
    message: "Token created. Copy it now; it will not be shown again.",
    data: { token },
  };
}

export async function revokeMcpTokenAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await owner();
  if (!ctx) return DENIED;
  const id = z.uuid().safeParse(formString(formData, "tokenId"));
  if (!id.success) return { message: "Token not found." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("mcp_tokens")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", id.data)
    .eq("clinic_id", ctx.clinicId)
    .is("revoked_at", null)
    .select("id")
    .maybeSingle();
  if (error || !data) return { message: "Token was already revoked or could not be found." };
  await logAudit(supabase, ctx.clinicId, "mcp.token_revoked", "mcp_token", id.data);
  revalidatePath("/integrations");
  return { ok: true, message: "Token revoked." };
}
