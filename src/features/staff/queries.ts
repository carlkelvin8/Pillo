import { z } from "zod";
import { ROLES, type Role } from "@/features/auth/permissions";
import { createClient } from "@/lib/supabase/server";

export type TeamMember = {
  membershipId: string;
  userId: string;
  role: Role;
  name: string | null;
  email: string | null;
};

export type PendingInvitation = { id: string; email: string; role: Role; createdAt: string };

const memberRowSchema = z.object({ id: z.uuid(), user_id: z.uuid(), role: z.enum(ROLES) });
const profileRowSchema = z.object({
  id: z.uuid(),
  full_name: z.string().nullable(),
  email: z.string().nullable(),
});
const invitationRowSchema = z.object({
  id: z.uuid(),
  email: z.string(),
  role: z.enum(ROLES),
  created_at: z.string(),
});

/** Members of one clinic (RLS also limits this to clinics the caller belongs to). */
export async function listTeam(clinicId: string): Promise<TeamMember[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("memberships")
    .select("id, user_id, role")
    .eq("clinic_id", clinicId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`Could not load team (${error.code})`);
  const members = z.array(memberRowSchema).parse(data ?? []);

  const { data: profileData, error: profileError } = await supabase
    .from("profiles")
    .select("id, full_name, email")
    .in(
      "id",
      members.map((m) => m.user_id),
    );
  if (profileError) throw new Error(`Could not load profiles (${profileError.code})`);
  const profiles = new Map(
    z
      .array(profileRowSchema)
      .parse(profileData ?? [])
      .map((p) => [p.id, p]),
  );

  return members.map((m) => ({
    membershipId: m.id,
    userId: m.user_id,
    role: m.role,
    name: profiles.get(m.user_id)?.full_name ?? null,
    email: profiles.get(m.user_id)?.email ?? null,
  }));
}

/** Open invitations (not accepted, not revoked, not expired). Owners only (RLS). */
export async function listPendingInvitations(clinicId: string): Promise<PendingInvitation[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("invitations")
    .select("id, email, role, created_at")
    .eq("clinic_id", clinicId)
    .is("accepted_at", null)
    .is("revoked_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: true });
  if (error) throw new Error(`Could not load invitations (${error.code})`);
  return z
    .array(invitationRowSchema)
    .parse(data ?? [])
    .map((i) => ({ id: i.id, email: i.email, role: i.role, createdAt: i.created_at }));
}
