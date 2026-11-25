import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardTitle } from "@/components/ui/card";
import { requireCapability } from "@/features/auth/workspace";
import {
  AddBranchDialog,
  BranchDetailsForm,
  HoursForm,
  type DayHours,
} from "@/features/branches/components/branch-forms";
import { listBranches, listClinicHours } from "@/features/scheduling/queries";
import { hhmm } from "@/lib/datetime";

export const metadata: Metadata = { title: "Branches and hours" };

const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6];

export default async function BranchesSettingsPage() {
  const { membership } = await requireCapability("staff.manage");
  const clinicId = membership.clinic.id;
  const [branches, hours] = await Promise.all([listBranches(clinicId), listClinicHours(clinicId)]);

  return (
    <>
      <PageHeader eyebrow="Settings" title="Branches and hours" actions={<AddBranchDialog />} />
      {branches.map((b) => {
        const rows = hours.filter((h) => h.branch_id === b.id);
        const saved = rows.length > 0;
        // With no saved hours, suggest Monday to Friday 9 to 5. It is only a starting point and is not saved.
        const days: DayHours[] = WEEKDAYS.map((weekday) => {
          const row = rows.find((r) => r.weekday === weekday);
          if (row)
            return { weekday, open: true, opens: hhmm(row.opens_at), closes: hhmm(row.closes_at) };
          return {
            weekday,
            open: !saved && weekday >= 1 && weekday <= 5,
            opens: "09:00",
            closes: "17:00",
          };
        });
        return (
          <section key={b.id} aria-label={b.name} className="grid gap-6 lg:grid-cols-2">
            <Card className="flex flex-col gap-5">
              <CardTitle>{b.name}</CardTitle>
              <BranchDetailsForm
                branch={{ id: b.id, name: b.name, address: b.address, phone: b.phone }}
              />
            </Card>
            <Card className="flex flex-col gap-5">
              <CardTitle>Opening hours</CardTitle>
              <HoursForm branchId={b.id} days={days} saved={saved} />
            </Card>
          </section>
        );
      })}
    </>
  );
}
