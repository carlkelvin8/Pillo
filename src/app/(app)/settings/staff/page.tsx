import type { Metadata } from "next";
import { Check, Minus } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardTitle } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { Table, Td, Th } from "@/components/ui/table";
import {
  CAPABILITY_LABELS,
  MATRIX_CAPABILITIES,
  ROLES,
  ROLE_LABELS,
  can,
} from "@/features/auth/permissions";
import { requireCapability } from "@/features/auth/workspace";
import { EditMemberDialog } from "@/features/staff/components/edit-member-dialog";
import { InviteForm } from "@/features/staff/components/invite-form";
import { RevokeButton } from "@/features/staff/components/revoke-button";
import { listPendingInvitations, listTeam } from "@/features/staff/queries";
import { initials } from "@/lib/initials";

export const metadata: Metadata = { title: "Staff and roles" };

function Avatar({ label }: { label: string }) {
  return (
    <span
      aria-hidden="true"
      className="bg-mint text-mint-ink flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold"
    >
      {initials(label)}
    </span>
  );
}

export default async function StaffSettingsPage() {
  const { membership, user } = await requireCapability("staff.manage");
  const clinicId = membership.clinic.id;
  const [team, invitations] = await Promise.all([
    listTeam(clinicId),
    listPendingInvitations(clinicId),
  ]);
  const people = team.length + invitations.length;

  return (
    <>
      <PageHeader eyebrow="Settings" title="Staff and roles" />

      <Card className="flex flex-col gap-4">
        <div>
          <CardTitle>Team</CardTitle>
          <p className="text-muted">
            {people} {people === 1 ? "person" : "people"} with access or invited.
          </p>
        </div>
        <ul className="divide-line flex flex-col divide-y">
          {team.map((m) => {
            const display = m.name ?? m.email ?? "Unknown";
            return (
              <li key={m.membershipId} className="flex flex-wrap items-center gap-4 py-3">
                <Avatar label={display} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">
                    {display}
                    {m.userId === user.id ? (
                      <span className="text-muted font-normal"> (you)</span>
                    ) : null}
                  </p>
                  <p className="text-muted truncate text-sm">{m.email}</p>
                </div>
                <Chip tone="neutral">{ROLE_LABELS[m.role]}</Chip>
                <Chip tone="success">Active</Chip>
                <EditMemberDialog
                  membershipId={m.membershipId}
                  displayName={display}
                  role={m.role}
                />
              </li>
            );
          })}
          {invitations.map((i) => (
            <li key={i.id} className="flex flex-wrap items-center gap-4 py-3">
              <Avatar label={i.email} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{i.email}</p>
                <p className="text-muted text-sm">Joins when they sign up with this email</p>
              </div>
              <Chip tone="neutral">{ROLE_LABELS[i.role]}</Chip>
              <Chip tone="pending">Invited</Chip>
              <RevokeButton invitationId={i.id} />
            </li>
          ))}
        </ul>
      </Card>

      <Card className="flex flex-col gap-4">
        <div>
          <CardTitle>Invite someone</CardTitle>
          <p className="text-muted">
            No email is sent yet. They get access automatically when they create an account with
            this address and confirm it.
          </p>
        </div>
        <InviteForm />
      </Card>

      <Card className="flex flex-col gap-4">
        <div>
          <CardTitle>Role permissions</CardTitle>
          <p className="text-muted">What each role can do.</p>
        </div>
        <Table>
          <caption className="sr-only">Role permissions</caption>
          <thead>
            <tr>
              <Th>Permission</Th>
              {ROLES.map((role) => (
                <Th key={role} className="text-center">
                  {ROLE_LABELS[role]}
                </Th>
              ))}
            </tr>
          </thead>
          <tbody>
            {MATRIX_CAPABILITIES.map((cap) => (
              <tr key={cap}>
                <Td className="font-medium">{CAPABILITY_LABELS[cap]}</Td>
                {ROLES.map((role) => (
                  <Td key={role} className="text-center">
                    {can(role, cap) ? (
                      <Check className="text-mint-ink mx-auto size-4" aria-label="Allowed" />
                    ) : (
                      <Minus className="text-muted mx-auto size-4" aria-label="Not allowed" />
                    )}
                  </Td>
                ))}
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
