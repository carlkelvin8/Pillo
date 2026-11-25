import { NextResponse } from "next/server";
import { logAudit } from "@/features/audit/log";
import { can } from "@/features/auth/permissions";
import { getWorkspace } from "@/features/auth/workspace";
import { getInvoice } from "@/features/invoices/queries";
import { renderInvoicePdf } from "@/features/invoices/pdf";
import { patientNames } from "@/features/patients/queries";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const workspace = await getWorkspace();
  if (!workspace?.membership || (!can(workspace.membership.role, "invoices.create") && !can(workspace.membership.role, "payments.manage")))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const clinic = workspace.membership.clinic;
  const detail = await getInvoice(clinic.id, id);
  if (!detail) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const patient = (await patientNames(clinic.id, [detail.invoice.patient_id])).get(detail.invoice.patient_id);
  const bytes = await renderInvoicePdf({
    clinicName: clinic.name,
    invoiceNumber: detail.invoice.invoice_number,
    patientName: patient?.name ?? "Patient",
    status: detail.invoice.status,
    dueOn: detail.invoice.due_on,
    items: detail.items,
    subtotalCentavos: detail.invoice.subtotal_centavos,
    discountCentavos: detail.invoice.discount_centavos,
    taxCentavos: detail.invoice.tax_centavos,
    totalCentavos: detail.invoice.total_centavos,
  });
  const supabase = await createClient();
  await logAudit(supabase, clinic.id, "invoice.downloaded", "invoice", id);
  return new NextResponse(Buffer.from(bytes), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="invoice-${detail.invoice.invoice_number}.pdf"`, "Cache-Control": "private, no-store" },
  });
}
