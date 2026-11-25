"use server";

import { revalidatePath } from "next/cache";
import { logAudit } from "@/features/audit/log";
import { can } from "@/features/auth/permissions";
import { getWorkspace } from "@/features/auth/workspace";
import {
  changeRoleSchema,
  invitationIdSchema,
  inviteSchema,
  membershipIdSchema,
} from "@/features/staff/schemas";
import { echo, formString, validationFailed, type ActionState } from "@/lib/action-state";
import { createClient } from "@/lib/supabase/server";

const DENIED: ActionState = { message: "Only the clinic owner can manage staff." };
const LAST_OWNER: ActionState = { message: "A clinic must keep at least one owner." };

async function ownerContext() {
  const ws = await getWorkspace();
  if (!ws?.membership || !can(ws.membership.role, "staff.manage")) return null;
  return { user: ws.user, clinicId: ws.membership.clinic.id };
}

function refresh() {
  revalidatePath("/settings/staff");
  revalidatePath("/onboarding");
}

/**
 * Creates a pending invitation. No email is sent yet (notifications arrive in a later phase):
 * the person joins automatically when they sign up with this confirmed email address.
 */
export async function inviteMemberAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await ownerContext();
  if (!ctx) return DENIED;

  const parsed = inviteSchema.safeParse({
    email: formString(formData, "email"),
    role: formString(formData, "role"),
  });
  if (!parsed.success) return validationFailed(parsed.error, formData, ["email", "role"]);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("invitations")
    .insert({
      clinic_id: ctx.clinicId,
      email: parsed.data.email,
      role: parsed.data.role,
      invited_by: ctx.user.id,
    })
    .select("id");
  if (error?.code === "23505")
    return {
      message: "That email already has a pending invitation.",
      values: echo(formData, ["email", "role"]),
    };
  if (error || !data?.length) return { message: "We could not create the invitation." };

  await logAudit(supabase, ctx.clinicId, "invitation.created", "invitation", data[0]?.id ?? null, {
    role: parsed.data.role,
  });
  refresh();
  return {
    ok: true,
    message: "Invitation saved. They will join when they sign up with this email.",
  };
}

export async function revokeInvitationAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await ownerContext();
  if (!ctx) return DENIED;
  const parsed = invitationIdSchema.safeParse({
    invitationId: formString(formData, "invitationId"),
  });
  if (!parsed.success) return { message: "Invalid invitation." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("invitations")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", parsed.data.invitationId)
    .eq("clinic_id", ctx.clinicId)
    .is("accepted_at", null)
    .select("id");
  if (error || !data?.length) return { message: "We could not revoke that invitation." };

  await logAudit(
    supabase,
    ctx.clinicId,
    "invitation.revoked",
    "invitation",
    parsed.data.invitationId,
  );
  refresh();
  return { ok: true, message: "Invitation revoked." };
}

export async function changeRoleAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await ownerContext();
  if (!ctx) return DENIED;
  const parsed = changeRoleSchema.safeParse({
    membershipId: formString(formData, "membershipId"),
    role: formString(formData, "role"),
  });
  if (!parsed.success) return validationFailed(parsed.error);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("memberships")
    .update({ role: parsed.data.role })
    .eq("id", parsed.data.membershipId)
    .eq("clinic_id", ctx.clinicId)
    .select("id");
  if (error?.message.includes("at least one owner")) return LAST_OWNER;
  if (error || !data?.length) return { message: "We could not change that role." };

  await logAudit(
    supabase,
    ctx.clinicId,
    "membership.role_changed",
    "membership",
    parsed.data.membershipId,
    {
      role: parsed.data.role,
    },
  );
  refresh();
  revalidatePath("/", "layout");
  return { ok: true, message: "Role updated." };
}

export async function removeMemberAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await ownerContext();
  if (!ctx) return DENIED;
  const parsed = membershipIdSchema.safeParse({
    membershipId: formString(formData, "membershipId"),
  });
  if (!parsed.success) return { message: "Invalid member." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("memberships")
    .delete()
    .eq("id", parsed.data.membershipId)
    .eq("clinic_id", ctx.clinicId)
    .select("id");
  if (error?.message.includes("at least one owner")) return LAST_OWNER;
  if (error || !data?.length) return { message: "We could not remove that person." };

  await logAudit(
    supabase,
    ctx.clinicId,
    "membership.removed",
    "membership",
    parsed.data.membershipId,
  );
  refresh();
  return { ok: true, message: "Removed." };
}
