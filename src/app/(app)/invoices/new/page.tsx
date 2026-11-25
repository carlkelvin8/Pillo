import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { requireCapability } from "@/features/auth/workspace";
import { InvoiceForm } from "@/features/invoices/components/invoice-form";
import { listBranches, listDoctors } from "@/features/scheduling/queries";
import { addDays, todayIn } from "@/lib/datetime";

export const metadata: Metadata = { title: "New invoice" };

export default async function NewInvoicePage() {
  const { membership } = await requireCapability("invoices.create");
  const clinicId = membership.clinic.id;
  const today = todayIn(membership.clinic.timezone);
  const [doctors, branches] = await Promise.all([
    listDoctors(clinicId, { activeOnly: true }),
    listBranches(clinicId),
  ]);
  return (
    <>
      <PageHeader eyebrow="Money" title="New invoice" />
      <InvoiceForm
        doctors={doctors.map((d) => ({ id: d.id, name: d.display_name }))}
        branches={branches.map((b) => ({ id: b.id, name: b.name }))}
        today={today}
        defaultDue={addDays(today, 7)}
      />
    </>
  );
}
