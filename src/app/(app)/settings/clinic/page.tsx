import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardTitle } from "@/components/ui/card";
import { requireCapability } from "@/features/auth/workspace";
import { updateClinicAction } from "@/features/clinic/actions";
import { ClinicDetailsForm } from "@/features/clinic/components/clinic-details-form";

export const metadata: Metadata = { title: "Clinic profile" };

export default async function ClinicSettingsPage() {
  const { membership } = await requireCapability("staff.manage");
  return (
    <>
      <PageHeader eyebrow="Settings" title="Clinic profile" />
      <Card className="flex flex-col gap-6">
        <CardTitle>Clinic details</CardTitle>
        <ClinicDetailsForm
          action={updateClinicAction}
          initial={membership.clinic}
          submitLabel="Save changes"
        />
      </Card>
    </>
  );
}
