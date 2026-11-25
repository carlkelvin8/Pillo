import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardTitle } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { requireCapability } from "@/features/auth/workspace";
import { AddDoctorDialog, DoctorActiveButton } from "@/features/branches/components/doctor-forms";
import { DoctorHoursEditor } from "@/features/branches/components/doctor-hours-editor";
import { listBranches, listDoctorHours, listDoctors } from "@/features/scheduling/queries";
import { initials } from "@/lib/initials";

export const metadata: Metadata = { title: "Doctors" };

export default async function DoctorsSettingsPage() {
  const { membership, user } = await requireCapability("staff.manage");
  const [doctors, branches, doctorHours] = await Promise.all([
    listDoctors(membership.clinic.id),
    listBranches(membership.clinic.id),
    listDoctorHours(membership.clinic.id),
  ]);
  const selfListed = doctors.some((d) => d.membership_id === membership.id);

  return (
    <>
      <PageHeader
        eyebrow="Settings"
        title="Doctors"
        actions={
          <AddDoctorDialog canLinkSelf={!selfListed} defaultName={user.fullName ?? user.email} />
        }
      />
      <Card className="flex flex-col gap-4">
        <div>
          <CardTitle>Bookable doctors</CardTitle>
          <p className="text-muted">
            Patients can only be booked with a doctor listed here. Anyone invited with the Doctor
            role is added automatically.
          </p>
        </div>
        {doctors.length === 0 ? (
          <p className="text-muted">
            No doctors yet. If you see patients yourself, add yourself with &ldquo;This is
            me&rdquo;.
          </p>
        ) : (
          <ul className="divide-line flex flex-col divide-y">
            {doctors.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center gap-4 py-3">
                <span
                  aria-hidden="true"
                  className="bg-mint text-mint-ink flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold"
                >
                  {initials(d.display_name)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{d.display_name}</p>
                  <p className="text-muted truncate text-sm">{d.specialty ?? "No specialty set"}</p>
                </div>
                {d.membership_id ? (
                  <Chip tone="neutral">Has a login</Chip>
                ) : (
                  <Chip tone="neutral">No login</Chip>
                )}
                <Chip tone={d.active ? "success" : "neutral"}>
                  {d.active ? "Bookable" : "Inactive"}
                </Chip>
                <DoctorActiveButton doctorId={d.id} active={d.active} name={d.display_name} />
                <DoctorHoursEditor
                  doctorId={d.id}
                  branches={branches}
                  windows={doctorHours.filter((window) => window.doctor_id === d.id)}
                />
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
