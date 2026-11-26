import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardTitle } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { requireCapability } from "@/features/auth/workspace";
import { OnlinePaymentsSoon } from "@/features/payments/components/online-payments-soon";
import { RecordedHero } from "@/features/payments/components/recorded-hero";
import {
  collectionsData,
  listTransactions,
  methodLabel,
  TRANSACTION_PAGE_SIZE,
  type TransactionFilter,
} from "@/features/payments/queries";
import { addDays, dateOf, formatDateShort, todayIn, zonedToUtcIso } from "@/lib/datetime";
import { formatPHP } from "@/lib/money";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Payments" };

type Props = { searchParams: Promise<{ filter?: string; page?: string }> };
const FILTERS = [
  { key: "all", label: "All" },
  { key: "pending", label: "Pending" },
] as const;
type Filter = TransactionFilter;

const TONE = {
  paid: "success",
  pending: "pending",
} as const;
const LABEL = {
  paid: "Paid",
  pending: "Pending",
} as const;

export default async function PaymentsPage({ searchParams }: Props) {
  const { membership } = await requireCapability("payments.manage");
  const params = await searchParams;
  const filter: Filter = FILTERS.find((f) => f.key === params.filter)?.key ?? "all";
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);
  const clinicId = membership.clinic.id;
  const tz = membership.clinic.timezone;
  const today = todayIn(tz);

  const monthStart = `${today.slice(0, 8)}01`;
  const rangeStart = addDays(today, -29) < monthStart ? addDays(today, -29) : monthStart;
  const sinceIso = zonedToUtcIso(rangeStart, "00:00", tz);
  const [{ items, total }, collections] = await Promise.all([
    listTransactions(clinicId, { page, filter }),
    collectionsData(clinicId, sinceIso, tz),
  ]);
  const last30 = addDays(today, -29);
  const rows = collections.rows.filter((r) => dateOf(r.paid_at, tz) >= last30);
  const byMethod = new Map<string, number>();
  for (const r of rows) byMethod.set(r.method, (byMethod.get(r.method) ?? 0) + r.amount_centavos);
  const mix = { rows, byMethod };
  const monthRows = collections.rows.filter((r) => dateOf(r.paid_at, tz) >= monthStart);
  const recordedThisMonth = monthRows.reduce((a, r) => a + r.amount_centavos, 0);
  const totalMix = [...mix.byMethod.values()].reduce((a, b) => a + b, 0);
  const pages = Math.max(1, Math.ceil(total / TRANSACTION_PAGE_SIZE));
  const href = (f: Filter, p: number) => {
    const query = new URLSearchParams();
    if (f !== "all") query.set("filter", f);
    if (p > 1) query.set("page", String(p));
    return query.size ? `/payments?${query}` : "/payments";
  };

  if (page > pages) redirect(href(filter, pages));

  return (
    <>
      <PageHeader eyebrow="Money" title="Payment records" />
      <div className="grid items-stretch gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <RecordedHero centavos={recordedThisMonth} count={monthRows.length} />
        <Card className="flex flex-col gap-4">
          <div>
            <CardTitle>Collections</CardTitle>
            <p className="text-muted mt-1 text-sm">Recorded in the last 30 days</p>
          </div>
          <div>
            <p className="tabular text-2xl font-semibold tracking-tight">{formatPHP(totalMix)}</p>
            <p className="text-muted text-sm">
              {mix.rows.length === 0
                ? "No payments recorded in this period."
                : `${mix.rows.length} recorded ${mix.rows.length === 1 ? "payment" : "payments"}`}
            </p>
          </div>
          {totalMix > 0 ? (
            <>
              <h4 className="text-sm font-semibold">Payment methods</h4>
              <ul className="flex flex-col gap-3">
                {[...mix.byMethod.entries()]
                  .sort((a, b) => b[1] - a[1])
                  .map(([method, amount]) => {
                    const pct = Math.round((amount / totalMix) * 100);
                    return (
                      <li key={method} className="flex flex-col gap-1">
                        <div className="flex justify-between text-sm">
                          <span>{methodLabel(method as Parameters<typeof methodLabel>[0])}</span>
                          <span className="tabular font-medium">{pct}%</span>
                        </div>
                        <div
                          className="bg-subtle h-2 overflow-hidden rounded-full"
                          aria-hidden="true"
                        >
                          <div
                            className="bg-mint-strong h-full rounded-full"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </li>
                    );
                  })}
              </ul>
            </>
          ) : null}
          <OnlinePaymentsSoon />
        </Card>
      </div>

      <Card className="flex flex-col gap-4 p-2 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3 px-2 pt-2 sm:px-0 sm:pt-0">
          <CardTitle>Transactions</CardTitle>
          <nav aria-label="Transaction filters" className="flex gap-1.5">
            {FILTERS.map((f) => (
              <Link
                key={f.key}
                href={href(f.key, 1)}
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
        </div>
        {items.length === 0 ? (
          <p className="text-muted px-4 py-10 text-center">
            {filter === "pending"
              ? "No pending transactions."
              : "No payments recorded yet. Open an invoice and choose Record payment."}
          </p>
        ) : (
          <ul className="divide-line flex flex-col divide-y">
            {items.map((t) => (
              <li
                key={t.id}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 px-2 py-3 sm:grid-cols-[minmax(0,1fr)_auto_minmax(8rem,auto)] sm:px-0"
              >
                <div className="row-span-2 min-w-0 sm:row-span-1">
                  {t.invoiceId ? (
                    <Link
                      href={`/invoices/${t.invoiceId}`}
                      className="inline-flex min-h-11 items-center font-semibold wrap-anywhere hover:underline"
                    >
                      {t.title}
                    </Link>
                  ) : (
                    <p className="font-semibold">{t.title}</p>
                  )}
                  <p className="text-muted text-sm">
                    {t.subtitle} ·{" "}
                    <span className="tabular">{formatDateShort(dateOf(t.at, tz))}</span>
                  </p>
                </div>
                <Chip className="justify-self-end" tone={TONE[t.status]}>
                  {LABEL[t.status]}
                </Chip>
                <span
                  className={cn(
                    "tabular text-right font-semibold",
                    t.centavos < 0 ? "text-ink" : "text-mint-ink",
                  )}
                >
                  {t.centavos < 0 ? "−" : "+"}
                  {formatPHP(Math.abs(t.centavos))}
                </span>
              </li>
            ))}
          </ul>
        )}
        <nav
          aria-label="Transaction pages"
          className="border-line flex flex-wrap items-center justify-between gap-3 border-t pt-4"
        >
          <span className="text-muted text-sm">
            Showing {total === 0 ? 0 : (page - 1) * TRANSACTION_PAGE_SIZE + 1} to{" "}
            {Math.min(page * TRANSACTION_PAGE_SIZE, total)} of {total} · {TRANSACTION_PAGE_SIZE} per
            page
          </span>
          <div className="flex gap-2">
            <Link
              aria-disabled={page <= 1}
              tabIndex={page <= 1 ? -1 : undefined}
              className="border-line inline-flex min-h-11 items-center rounded-full border px-4 text-sm aria-disabled:pointer-events-none aria-disabled:opacity-40"
              href={href(filter, Math.max(1, page - 1))}
            >
              Previous
            </Link>
            <Link
              aria-disabled={page >= pages}
              tabIndex={page >= pages ? -1 : undefined}
              className="border-line inline-flex min-h-11 items-center rounded-full border px-4 text-sm aria-disabled:pointer-events-none aria-disabled:opacity-40"
              href={href(filter, Math.min(pages, page + 1))}
            >
              Next
            </Link>
          </div>
        </nav>
      </Card>
    </>
  );
}
