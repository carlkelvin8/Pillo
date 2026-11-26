import type { Metadata } from "next";
import Link from "next/link";
import { FilePlus } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { Table, Td, Th } from "@/components/ui/table";
import { requireCapability } from "@/features/auth/workspace";
import {
  INVOICE_PAGE_SIZE,
  invoiceStats,
  listInvoices,
  type InvoiceFilter,
} from "@/features/invoices/queries";
import { displayStatus, invoiceLabel, STATUS_LABEL, STATUS_TONE } from "@/features/invoices/totals";
import { patientNames } from "@/features/patients/queries";
import { dateOf, formatDateShort, todayIn, zonedToUtcIso } from "@/lib/datetime";
import { initials } from "@/lib/initials";
import { formatPHP } from "@/lib/money";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Invoices" };

type Props = { searchParams: Promise<{ filter?: string; page?: string }> };
const FILTERS: { key: InvoiceFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "open", label: "Open" },
  { key: "overdue", label: "Overdue" },
  { key: "paid", label: "Paid" },
];

function Stat({
  label,
  centavos,
  count,
  unit,
}: {
  label: string;
  centavos: number;
  count: number;
  unit: string;
}) {
  return (
    <Card className="flex flex-col gap-1">
      <span className="text-muted text-sm">{label}</span>
      <span className="tabular text-3xl font-semibold tracking-tight">{formatPHP(centavos)}</span>
      <span className="text-muted text-sm">
        {count} {count === 1 ? unit : `${unit}s`}
      </span>
    </Card>
  );
}

export default async function InvoicesPage({ searchParams }: Props) {
  const { membership } = await requireCapability("invoices.create");
  const params = await searchParams;
  const clinicId = membership.clinic.id;
  const tz = membership.clinic.timezone;
  const filter = FILTERS.find((f) => f.key === params.filter)?.key ?? "all";
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);
  const today = todayIn(tz);
  const monthStartIso = zonedToUtcIso(`${today.slice(0, 8)}01`, "00:00", tz);

  const [{ rows, total }, stats] = await Promise.all([
    listInvoices({ clinicId, filter, today, page }),
    invoiceStats(clinicId, today, monthStartIso),
  ]);
  const names = await patientNames(
    clinicId,
    rows.map((r) => r.patient_id),
  );
  const pages = Math.max(1, Math.ceil(total / INVOICE_PAGE_SIZE));
  const href = (f: InvoiceFilter, p = 1) =>
    `/invoices${f === "all" && p === 1 ? "" : `?${new URLSearchParams({ ...(f === "all" ? {} : { filter: f }), ...(p > 1 ? { page: String(p) } : {}) })}`}`;

  return (
    <>
      <PageHeader
        eyebrow="Money"
        title="Invoices"
        actions={
          <Button asChild>
            <Link href="/invoices/new">
              <FilePlus aria-hidden="true" /> New invoice
            </Link>
          </Button>
        }
      />
      <div className="grid gap-6 md:grid-cols-3">
        <Stat label="Open" centavos={stats.open.centavos} count={stats.open.count} unit="invoice" />
        <Stat
          label="Overdue"
          centavos={stats.overdue.centavos}
          count={stats.overdue.count}
          unit="invoice"
        />
        <Stat
          label="Paid this month"
          centavos={stats.paidThisMonth.centavos}
          count={stats.paidThisMonth.count}
          unit="invoice"
        />
      </div>
      <Card className="flex flex-col gap-4 p-2 sm:p-4">
        <nav aria-label="Invoice filters" className="flex gap-1.5 px-2 pt-2">
          {FILTERS.map((f) => (
            <Link
              key={f.key}
              href={href(f.key)}
              aria-current={filter === f.key ? "page" : undefined}
              className={cn(
                "inline-flex min-h-11 items-center rounded-full px-4 text-sm font-medium",
                filter === f.key ? "bg-ink text-surface" : "text-muted hover:text-ink",
              )}
            >
              {f.label}
            </Link>
          ))}
        </nav>
        {rows.length === 0 ? (
          <p className="text-muted px-4 py-12 text-center">
            {filter === "all"
              ? "No invoices yet. Create your first invoice."
              : "No invoices match."}
          </p>
        ) : (
          <Table>
            <caption className="sr-only">Invoices</caption>
            <thead>
              <tr>
                <Th>Invoice</Th>
                <Th>Patient</Th>
                <Th>Date</Th>
                <Th className="text-right">Amount</Th>
                <Th>Status</Th>
                <Th>
                  <span className="sr-only">Action</span>
                </Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const status = displayStatus(r.status, r.due_on, today);
                const name = names.get(r.patient_id)?.name ?? "Patient";
                return (
                  <tr key={r.id} className="hover:bg-canvas">
                    <Td className="tabular font-semibold">
                      <Link
                        href={`/invoices/${r.id}`}
                        className="inline-flex min-h-11 items-center"
                      >
                        {invoiceLabel(r.invoice_number)}
                      </Link>
                    </Td>
                    <Td>
                      <span className="flex items-center gap-3">
                        <span
                          aria-hidden="true"
                          className="bg-mint text-mint-ink flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold"
                        >
                          {initials(name)}
                        </span>
                        {name}
                      </span>
                    </Td>
                    <Td className="tabular text-ink-2">
                      {formatDateShort(dateOf(r.created_at, tz))}
                    </Td>
                    <Td className="tabular text-right font-medium">
                      {formatPHP(r.total_centavos)}
                    </Td>
                    <Td>
                      <Chip tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Chip>
                    </Td>
                    <Td>
                      <Link
                        href={`/invoices/${r.id}`}
                        className="inline-flex min-h-11 items-center text-sm font-medium underline underline-offset-4"
                      >
                        {status === "paid"
                          ? "View receipt"
                          : status === "pending" || status === "overdue"
                            ? "Request payment"
                            : "Open"}
                      </Link>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
        <nav
          aria-label="Invoice pagination"
          className="flex flex-wrap items-center justify-between gap-3 px-2 pb-2"
        >
          <span className="tabular text-muted text-sm">
            Showing {total === 0 ? 0 : (page - 1) * INVOICE_PAGE_SIZE + 1} to{" "}
            {Math.min(page * INVOICE_PAGE_SIZE, total)} of {total} · {INVOICE_PAGE_SIZE} per page
          </span>
          <div className="flex items-center gap-2">
            <Button
              asChild
              variant="ghost"
              className={page <= 1 ? "pointer-events-none opacity-50" : undefined}
            >
              <Link
                href={href(filter, Math.max(1, page - 1))}
                aria-disabled={page <= 1}
                tabIndex={page <= 1 ? -1 : undefined}
              >
                Previous
              </Link>
            </Button>
            <span className="tabular text-muted text-sm">
              Page {page} of {pages}
            </span>
            <Button
              asChild
              variant="ghost"
              className={page >= pages ? "pointer-events-none opacity-50" : undefined}
            >
              <Link
                href={href(filter, page + 1)}
                aria-disabled={page >= pages}
                tabIndex={page >= pages ? -1 : undefined}
              >
                Next
              </Link>
            </Button>
          </div>
        </nav>
      </Card>
    </>
  );
}
