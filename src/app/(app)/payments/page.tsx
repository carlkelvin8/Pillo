import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardTitle } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { requireCapability } from "@/features/auth/workspace";
import { BalanceHero } from "@/features/payments/components/balance-hero";
import { WithdrawDialog } from "@/features/payments/components/withdraw-dialog";
import {
  collectionsData,
  getBalance,
  listTransactions,
  methodLabel,
  type Transaction,
} from "@/features/payments/queries";
import { addDays, dateOf, formatDateShort, nextBusinessDay, todayIn } from "@/lib/datetime";
import { formatPHP } from "@/lib/money";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Payments" };

type Props = { searchParams: Promise<{ filter?: string }> };
const FILTERS = [
  { key: "all", label: "All" },
  { key: "incoming", label: "Incoming" },
  { key: "outgoing", label: "Outgoing" },
  { key: "pending", label: "Pending" },
] as const;
type Filter = (typeof FILTERS)[number]["key"];

const TONE = {
  paid: "success",
  completed: "success",
  pending: "pending",
  processing: "pending",
} as const;
const LABEL = {
  paid: "Paid",
  completed: "Completed",
  pending: "Pending",
  processing: "Processing",
} as const;

const matches = (t: Transaction, f: Filter) =>
  f === "all" ||
  (f === "incoming" && t.kind === "incoming") ||
  (f === "outgoing" && t.kind === "outgoing") ||
  (f === "pending" && (t.status === "pending" || t.status === "processing"));

export default async function PaymentsPage({ searchParams }: Props) {
  const { membership } = await requireCapability("payments.manage");
  const params = await searchParams;
  const filter: Filter = FILTERS.find((f) => f.key === params.filter)?.key ?? "all";
  const clinicId = membership.clinic.id;
  const tz = membership.clinic.timezone;
  const today = todayIn(tz);

  const sinceIso = `${addDays(today, -30)}T00:00:00.000Z`;
  const [balance, { items, payouts }, mix] = await Promise.all([
    getBalance(clinicId),
    listTransactions(clinicId),
    collectionsData(clinicId, sinceIso, tz),
  ]);
  const shown = items.filter((t) => matches(t, filter));
  const totalMix = [...mix.byMethod.values()].reduce((a, b) => a + b, 0);
  const nextPayout = payouts
    .filter((p) => p.status === "processing")
    .sort((a, b) => a.arrives_on.localeCompare(b.arrives_on))[0];
  const arrives = formatDateShort(nextBusinessDay(today));

  return (
    <>
      <PageHeader eyebrow="Money" title="Payments" />
      <p
        role="note"
        className="rounded-card bg-amber-chip text-amber-chip-ink p-4 text-sm font-medium"
      >
        Demo payouts: withdrawals are recorded here but no real money moves yet. Online payments
        from patients are real once PayMongo is connected.
      </p>
      <BalanceHero centavos={balance}>
        <WithdrawDialog available={balance} arrives={arrives} />
      </BalanceHero>

      <div className="grid items-stretch gap-6 lg:grid-cols-[1.6fr_1fr]">
        <Card className="flex flex-col gap-4 p-2 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3 px-2 pt-2 sm:px-0 sm:pt-0">
            <CardTitle>Transactions</CardTitle>
            <nav aria-label="Transaction filters" className="flex gap-1.5">
              {FILTERS.map((f) => (
                <Link
                  key={f.key}
                  href={f.key === "all" ? "/payments" : `/payments?filter=${f.key}`}
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
          {shown.length === 0 ? (
            <p className="text-muted px-4 py-10 text-center">No transactions yet.</p>
          ) : (
            <ul className="divide-line flex flex-col divide-y">
              {shown.map((t) => (
                <li
                  key={`${t.kind}-${t.id}`}
                  className="flex flex-wrap items-center gap-x-4 gap-y-1 px-2 py-3 sm:px-0"
                >
                  <div className="min-w-0 flex-1">
                    {t.invoiceId ? (
                      <Link
                        href={`/invoices/${t.invoiceId}`}
                        className="font-semibold hover:underline"
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
                  <Chip tone={TONE[t.status]}>{LABEL[t.status]}</Chip>
                  <span
                    className={cn(
                      "tabular w-32 text-right font-semibold",
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
        </Card>

        <div className="flex flex-col gap-6">
          <Card className="flex flex-col gap-4">
            <CardTitle>How patients pay</CardTitle>
            <p className="text-muted -mt-2 text-sm">Last 30 days</p>
            {totalMix === 0 ? (
              <p className="text-muted text-sm">No payments yet.</p>
            ) : (
              <ul className="flex flex-col gap-3">
                {[...mix.byMethod.entries()]
                  .sort((a, b) => b[1] - a[1])
                  .map(([method, amount]) => {
                    const pct = Math.round((amount / totalMix) * 100);
                    return (
                      <li key={method} className="flex flex-col gap-1">
                        <div className="flex justify-between text-sm">
                          <span>{methodLabel(method as never)}</span>
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
            )}
          </Card>

          <Card className="flex flex-col gap-3">
            <CardTitle>Payout schedule</CardTitle>
            {nextPayout ? (
              <dl className="flex flex-col gap-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-muted">Next payout</dt>
                  <dd className="tabular font-medium">{formatDateShort(nextPayout.arrives_on)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted">Amount</dt>
                  <dd className="tabular font-medium">{formatPHP(nextPayout.amount_centavos)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted">To</dt>
                  <dd className="font-medium">{nextPayout.destination}</dd>
                </div>
              </dl>
            ) : (
              <p className="text-muted text-sm">
                No payouts scheduled. Use Withdraw to record one (demo).
              </p>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
