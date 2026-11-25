import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Card, CardTitle } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { Table, Td, Th } from "@/components/ui/table";
import { requireCapability } from "@/features/auth/workspace";
import {
  CancelLinkButton,
  CopyLink,
  RecordPaymentDialog,
  RequestPaymentButton,
  SendInvoiceButton,
  VoidInvoiceButton,
} from "@/features/invoices/components/invoice-actions";
import { amountPaid, getInvoice } from "@/features/invoices/queries";
import { DraftInvoiceEditor } from "@/features/invoices/components/draft-invoice-editor";
import { ShareInvoiceMessage } from "@/features/invoices/components/share-invoice-message";
import { displayStatus, invoiceLabel, STATUS_LABEL, STATUS_TONE } from "@/features/invoices/totals";
import { patientNames } from "@/features/patients/queries";
import { patientIdLabel } from "@/features/patients/age";
import { formatDateShort, formatTime, dateOf, todayIn } from "@/lib/datetime";
import { formatPHP } from "@/lib/money";

export const metadata: Metadata = { title: "Invoice" };

const METHOD_LABEL = {
  gcash: "GCash",
  maya: "Maya",
  card: "Card",
  cash: "Cash",
  bank: "Bank transfer",
} as const;

export default async function InvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { membership } = await requireCapability("invoices.create");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const clinic = membership.clinic;
  const tz = clinic.timezone;
  const detail = await getInvoice(clinic.id, id);
  if (!detail) notFound();
  const { invoice, items, payments } = detail;
  const patient = (await patientNames(clinic.id, [invoice.patient_id])).get(invoice.patient_id);
  const status = displayStatus(invoice.status, invoice.due_on, todayIn(tz));
  const paid = amountPaid(payments);
  const due = Math.max(0, invoice.total_centavos - paid);
  const openLink = payments.find((p) => p.status === "pending" && p.checkout_url);
  const canCollect = invoice.status === "draft" || invoice.status === "sent";
  const when = (iso: string) => `${formatDateShort(dateOf(iso, tz))}, ${formatTime(iso, tz)}`;

  const timeline: { at: string; label: string }[] = [
    { at: invoice.created_at, label: "Invoice created" },
  ];
  if (invoice.sent_at) timeline.push({ at: invoice.sent_at, label: "Marked as sent" });
  for (const p of payments) {
    if (p.status === "succeeded" && p.paid_at)
      timeline.push({
        at: p.paid_at,
        label: `Payment received${p.method ? ` · ${METHOD_LABEL[p.method]}` : ""} · ${formatPHP(p.amount_centavos)}`,
      });
    else if (p.status === "pending")
      timeline.push({ at: p.created_at, label: "Payment link created" });
    else if (p.status === "cancelled")
      timeline.push({ at: p.created_at, label: "Payment link cancelled" });
  }
  if (invoice.voided_at) timeline.push({ at: invoice.voided_at, label: "Invoice voided" });
  timeline.sort((a, b) => a.at.localeCompare(b.at));

  return (
    <>
      <div className="flex flex-col gap-4">
        <Link
          href="/invoices"
          className="text-muted hover:text-ink inline-flex min-h-11 w-fit items-center gap-2 text-sm font-medium"
        >
          <ArrowLeft className="size-4" aria-hidden="true" /> Invoices
        </Link>
        <div className="flex flex-wrap items-center gap-4">
          <h1 className="tabular text-title">{invoiceLabel(invoice.invoice_number)}</h1>
          <Chip tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Chip>
        </div>
      </div>
      {invoice.status === "draft" ? <DraftInvoiceEditor invoiceId={invoice.id} dueOn={invoice.due_on} patient={patient ? { id: invoice.patient_id, ...patient } : null} items={items} /> : null}

      <div className="grid items-start gap-6 lg:grid-cols-[1.7fr_1fr]">
        <Card className="flex flex-col gap-6">
            <a href={`/api/invoices/${invoice.id}/pdf`} className="text-ink min-h-11 w-fit font-medium underline">Download PDF</a>
          <div className="flex flex-wrap justify-between gap-4">
            <div>
              <p className="font-semibold">{clinic.name}</p>
              {clinic.address ? <p className="text-muted text-sm">{clinic.address}</p> : null}
            </div>
            <dl className="grid grid-cols-2 gap-x-8 gap-y-1 text-sm">
              <dt className="text-muted">Issued</dt>
              <dd className="tabular font-medium">{formatDateShort(invoice.issued_on)}</dd>
              <dt className="text-muted">Due</dt>
              <dd className="tabular font-medium">{formatDateShort(invoice.due_on)}</dd>
            </dl>
          </div>
          <div>
            <p className="text-muted text-sm">Billed to</p>
            <p className="font-semibold">{patient?.name ?? "Patient"}</p>
            {patient ? (
              <p className="text-muted text-sm">Patient ID {patientIdLabel(patient.number)}</p>
            ) : null}
          </div>
          <Table>
            <caption className="sr-only">Invoice items</caption>
            <thead>
              <tr>
                <Th>Description</Th>
                <Th className="text-right">Qty</Th>
                <Th className="text-right">Price</Th>
                <Th className="text-right">Amount</Th>
              </tr>
            </thead>
            <tbody>
              {items.map((i) => (
                <tr key={i.id}>
                  <Td>{i.description}</Td>
                  <Td className="tabular text-right">{i.quantity}</Td>
                  <Td className="tabular text-right">{formatPHP(i.unit_price_centavos)}</Td>
                  <Td className="tabular text-right font-medium">{formatPHP(i.amount_centavos)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
          <dl className="ml-auto flex w-full max-w-xs flex-col gap-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted">Subtotal</dt>
              <dd className="tabular">{formatPHP(invoice.subtotal_centavos)}</dd>
            </div>
            {invoice.discount_centavos > 0 ? (
              <div className="flex justify-between">
                <dt className="text-muted">Discount</dt>
                <dd className="tabular">
                  −{formatPHP(Math.min(invoice.discount_centavos, invoice.subtotal_centavos))}
                </dd>
              </div>
            ) : null}
            {invoice.tax_centavos > 0 ? (
              <div className="flex justify-between">
                <dt className="text-muted">Tax</dt>
                <dd className="tabular">{formatPHP(invoice.tax_centavos)}</dd>
              </div>
            ) : null}
            <div className="border-line flex justify-between border-t pt-2 text-base font-semibold">
              <dt>Total</dt>
              <dd className="tabular">{formatPHP(invoice.total_centavos)}</dd>
            </div>
            {paid > 0 ? (
              <div className="flex justify-between">
                <dt className="text-muted">Paid</dt>
                <dd className="tabular">−{formatPHP(paid)}</dd>
              </div>
            ) : null}
            <div className="flex justify-between text-base font-semibold">
              <dt>Amount due</dt>
              <dd className="tabular">{formatPHP(due)}</dd>
            </div>
          </dl>
          {invoice.note ? (
            <p className="rounded-control bg-canvas text-ink-2 p-4 text-sm">{invoice.note}</p>
          ) : null}
        </Card>

        <div className="flex flex-col gap-6">
          <Card className="flex flex-col gap-4">
            <CardTitle>Payment</CardTitle>
            {invoice.status === "paid" ? (
              <p className="rounded-control bg-mint text-mint-ink p-4 font-medium">Paid in full.</p>
            ) : null}
            {invoice.status === "void" ? (
              <p className="text-muted">This invoice was voided.</p>
            ) : null}
            {openLink?.checkout_url ? (
              <div className="flex flex-col gap-3">
                <p className="text-muted text-sm">
                  Share this link with the patient. It updates here automatically once they pay.
                </p>
                {openLink.provider === "mock" ? (
                  <p className="rounded-control bg-amber-chip text-amber-chip-ink px-3 py-2 text-sm">
                    Development link. No real money moves.
                  </p>
                ) : null}
                <CopyLink url={openLink.checkout_url} />
                <ShareInvoiceMessage invoiceId={invoice.id} invoiceNumber={invoice.invoice_number} url={openLink.checkout_url} />
                <CancelLinkButton paymentId={openLink.id} invoiceId={invoice.id} />
              </div>
            ) : null}
            {canCollect && !openLink && due > 0 ? (
              <RequestPaymentButton invoiceId={invoice.id} />
            ) : null}
            {canCollect && due > 0 ? (
              <RecordPaymentDialog invoiceId={invoice.id} dueLabel={formatPHP(due)} />
            ) : null}
            {invoice.status === "draft" ? <SendInvoiceButton invoiceId={invoice.id} /> : null}
            {canCollect && paid === 0 ? <VoidInvoiceButton invoiceId={invoice.id} /> : null}
          </Card>

          <Card className="flex flex-col gap-4">
            <CardTitle>Timeline</CardTitle>
            <ol className="flex flex-col gap-4">
              {timeline.map((t, i) => (
                <li key={`${t.at}-${i}`} className="flex gap-3">
                  <span
                    aria-hidden="true"
                    className="bg-mint-strong mt-1.5 size-2.5 shrink-0 rounded-full"
                  />
                  <div>
                    <p className="text-sm font-medium">{t.label}</p>
                    <p className="tabular text-muted text-xs">{when(t.at)}</p>
                  </div>
                </li>
              ))}
            </ol>
          </Card>
        </div>
      </div>
    </>
  );
}
