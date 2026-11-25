import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardTitle } from "@/components/ui/card";
import { requireCapability } from "@/features/auth/workspace";
import { updateClinicAction } from "@/features/clinic/actions";
import { ClinicDetailsForm } from "@/features/clinic/components/clinic-details-form";
import { clinicWebsiteSchema } from "@/features/clinic/schemas";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Clinic profile" };

export default async function ClinicSettingsPage() {
  const { membership } = await requireCapability("staff.manage");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("clinics")
    .select("website_url")
    .eq("id", membership.clinic.id)
    .single();
  // A hosted database may not have the website_url migration yet. Keep the
  // existing profile usable until that migration is applied; the form omits
  // the optional field when its initial value is undefined.
  if (error && error.code !== "42703") {
    throw new Error(`Could not load the clinic website (${error.code})`);
  }
  const websiteUrl = clinicWebsiteSchema.safeParse(data?.website_url).data ?? null;
  return (
    <>
      <PageHeader eyebrow="Settings" title="Clinic profile" />
      <Card className="flex flex-col gap-6">
        <CardTitle>Clinic details</CardTitle>
        <ClinicDetailsForm
          action={updateClinicAction}
          initial={{
            ...membership.clinic,
            ...(error?.code === "42703" ? {} : { websiteUrl }),
          }}
          submitLabel="Save changes"
        />
      </Card>
    </>
  );
}
