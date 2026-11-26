import { redirect } from "next/navigation";
import { cache } from "react";
import { z } from "zod";
import { clinicRowSchema, type Clinic } from "@/features/clinic/schemas";
import { can, ROLES, type Capability, type Role } from "@/features/auth/permissions";
import { createClient } from "@/lib/supabase/server";

export type CurrentUser = { id: string; email: string; fullName: string | null };
export type Membership = { id: string; role: Role; clinic: Clinic };
export type Workspace = { user: CurrentUser; membership: Membership | null };

const membershipRowSchema = z.object({
  id: z.uuid(),
  role: z.enum(ROLES),
  clinic: clinicRowSchema,
});

const CLINIC_COLUMNS =
  "id, name, address, phone, email, timezone, logo_path, assistant_settings, onboarding_completed_at";

export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const name: unknown = user.user_metadata?.full_name;
  return {
    id: user.id,
    email: user.email ?? "",
    fullName: typeof name === "string" && name.trim() !== "" ? name.trim() : null,
  };
});

/**
 * The signed-in user and their active clinic. The clinic always comes from the user's
 * membership (never from client input). With several memberships, the oldest is used
 * until an active-clinic switcher exists.
 */
export const getWorkspace = cache(async (): Promise<Workspace | null> => {
  const user = await getCurrentUser();
  if (!user) return null;
  const supabase = await createClient();

  // `afterInvite` changes the query text on purpose: Next.js memoizes identical GET fetches within
  // one render, so repeating the same query after the RPC would return the stale "no membership".
  const load = async (afterInvite = false): Promise<Membership | null> => {
    const { data, error } = await supabase
      .from("memberships")
      .select(`id, role${afterInvite ? ", created_at" : ""}, clinic:clinics(${CLINIC_COLUMNS})`)
      // RLS lets members see every membership in their clinic, so always filter to the caller's own.
      .eq("user_id", user.id)
      .order("created_at", { ascending: true })
      .limit(1);
    if (error) throw new Error(`Could not load membership (${error.code})`);
    const row = data?.[0];
    return row ? membershipRowSchema.parse(row) : null;
  };

  let membership = await load();
  if (!membership) {
    // First visit after sign-up: turn pending invitations for this confirmed email into memberships.
    await supabase.rpc("accept_pending_invitations");
    membership = await load(true);
  }
  return { user, membership };
});

/** For pages: must be signed in. */
export async function requireUser(): Promise<Workspace> {
  const ws = await getWorkspace();
  if (!ws) redirect("/login");
  return ws;
}

/** For app pages: must be signed in and in a clinic (owners must also finish onboarding). */
export async function requireMembership(): Promise<{ user: CurrentUser; membership: Membership }> {
  const ws = await requireUser();
  const { membership } = ws;
  if (!membership) redirect("/onboarding");
  if (membership.role === "owner" && membership.clinic.onboarding_completed_at === null) {
    redirect("/onboarding");
  }
  return { user: ws.user, membership };
}

/** For pages: must hold a capability, otherwise go home. */
export async function requireCapability(capability: Capability) {
  const ctx = await requireMembership();
  if (!can(ctx.membership.role, capability)) redirect("/dashboard");
  return ctx;
}
