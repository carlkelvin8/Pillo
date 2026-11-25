import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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
  const succeededPayments = payments
    .filter((payment) => payment.status === "succeeded" && payment.paid_at)
    .sort((a, b) => (a.paid_at ?? "").localeCompare(b.paid_at ?? ""));
  const latestPayment = succeededPayments.at(-1);
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
    <div className="@container flex flex-col gap-8">
      <header className="flex flex-col gap-4">
        <Link
          href="/invoices"
          className="text-muted hover:text-ink inline-flex min-h-11 w-fit items-center gap-2 text-sm font-medium"
        >
          <ArrowLeft className="size-4" aria-hidden="true" /> Invoices
        </Link>
        <div className="flex flex-wrap items-center gap-4">
          <h1 className="tabular text-title min-w-0 wrap-anywhere">
            {invoiceLabel(invoice.invoice_number)}
          </h1>
          <Chip tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Chip>
        </div>
      </header>

      <div className="grid items-start gap-6 @min-[48rem]:grid-cols-[minmax(0,1fr)_minmax(18rem,34%)]">
        <Card
          aria-labelledby="invoice-details"
          className="@container flex min-w-0 flex-col gap-6 p-4 sm:p-6"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="invoice-details" className="text-card-title">
              Invoice details
            </h2>
            <Button asChild variant="ghost">
              <a href={`/api/invoices/${invoice.id}/pdf`}>
                <Download aria-hidden="true" /> Download PDF
              </a>
            </Button>
          </div>
          <div className="border-line grid gap-4 border-y py-4 text-sm @min-[27rem]:grid-cols-[minmax(0,1fr)_auto]">
            <div className="flex min-w-0 flex-wrap gap-x-8 gap-y-4 wrap-anywhere">
              <div className="min-w-0 flex-1 basis-36">
                <p className="font-semibold">{clinic.name}</p>
                {clinic.address ? <p className="text-muted mt-1">{clinic.address}</p> : null}
              </div>
              <div className="min-w-0 flex-1 basis-36">
                <p className="text-muted">Billed to</p>
                <p className="font-semibold">{patient?.name ?? "Patient"}</p>
                {patient ? (
                  <p className="text-muted mt-1">Patient ID {patientIdLabel(patient.number)}</p>
                ) : null}
              </div>
            </div>
            <dl className="grid grid-cols-[auto_1fr] content-start gap-x-5 gap-y-1">
              <dt className="text-muted">Issued</dt>
              <dd className="tabular font-medium">{formatDateShort(invoice.issued_on)}</dd>
              <dt className="text-muted">Due</dt>
              <dd className="tabular font-medium">{formatDateShort(invoice.due_on)}</dd>
            </dl>
          </div>
          {invoice.status === "draft" ? (
            <DraftInvoiceEditor
              invoiceId={invoice.id}
              dueOn={invoice.due_on}
              patient={patient ? { id: invoice.patient_id, ...patient } : null}
              items={items}
            />
          ) : null}
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
                  <Td className="min-w-24 wrap-anywhere">{i.description}</Td>
                  <Td className="tabular text-right">{i.quantity}</Td>
                  <Td className="tabular text-right whitespace-nowrap">
                    {formatPHP(i.unit_price_centavos)}
                  </Td>
                  <Td className="tabular text-right font-medium whitespace-nowrap">
                    {formatPHP(i.amount_centavos)}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
          <dl className="ml-auto flex w-full max-w-xs flex-col gap-2 text-sm [&_dd]:text-right [&>div]:gap-3">
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
            <p className="rounded-control bg-canvas text-ink-2 p-4 text-sm wrap-anywhere">
              {invoice.note}
            </p>
          ) : null}
        </Card>

        <div className="flex min-w-0 flex-col gap-6">
          <Card aria-labelledby="invoice-payment" className="flex flex-col gap-4 p-4 sm:p-6">
            <h2 id="invoice-payment" className="text-card-title">
              Payment
            </h2>
            {paid > 0 ? (
              <section aria-label="Payment receipt" className="rounded-control bg-mint p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-mint-ink text-sm font-semibold">Total received</p>
                    <p className="tabular mt-1 text-2xl font-semibold tracking-tight wrap-anywhere">
                      {formatPHP(paid)}
                    </p>
                  </div>
                  {invoice.status === "paid" ? (
                    <Chip tone="success" className="bg-surface">
                      Paid in full
                    </Chip>
                  ) : null}
                </div>
                {latestPayment ? (
                  <div className="text-mint-ink border-mint-ink/15 mt-4 border-t pt-3 text-sm">
                    <p className="mb-2 text-xs font-semibold">Latest payment</p>
                    <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-2 [&_dd]:text-right [&_dd]:font-medium [&_dd]:wrap-anywhere">
                      <dt>Amount</dt>
                      <dd className="tabular">{formatPHP(latestPayment.amount_centavos)}</dd>
                      {latestPayment.method ? (
                        <>
                          <dt>Method</dt>
                          <dd>{METHOD_LABEL[latestPayment.method]}</dd>
                        </>
                      ) : null}
                      {latestPayment.paid_at ? (
                        <>
                          <dt>Received</dt>
                          <dd className="tabular">
                            <time dateTime={latestPayment.paid_at}>
                              {when(latestPayment.paid_at)}
                            </time>
                          </dd>
                        </>
                      ) : null}
                      {latestPayment.reference || latestPayment.provider_ref ? (
                        <>
                          <dt>Reference</dt>
                          <dd>{latestPayment.reference ?? latestPayment.provider_ref}</dd>
                        </>
                      ) : null}
                    </dl>
                  </div>
                ) : null}
              </section>
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
                <ShareInvoiceMessage
                  invoiceId={invoice.id}
                  invoiceNumber={invoice.invoice_number}
                  url={openLink.checkout_url}
                />
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

          <Card aria-labelledby="invoice-timeline" className="flex flex-col gap-4 p-4 sm:p-6">
            <h2 id="invoice-timeline" className="text-card-title">
              Timeline
            </h2>
            <ol className="divide-line divide-y">
              {timeline.map((t, i) => (
                <li key={`${t.at}-${i}`} className="flex gap-3 py-3 first:pt-0 last:pb-0">
                  <span
                    aria-hidden="true"
                    className="bg-mint-strong mt-1.5 size-2.5 shrink-0 rounded-full"
                  />
                  <div className="min-w-0 wrap-anywhere">
                    <p className="text-sm font-medium">{t.label}</p>
                    <time dateTime={t.at} className="tabular text-muted mt-1 block text-xs">
                      {when(t.at)}
                    </time>
                  </div>
                </li>
              ))}
            </ol>
          </Card>
        </div>
      </div>
    </div>
  );
}
