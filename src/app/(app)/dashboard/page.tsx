import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardTitle } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { can } from "@/features/auth/permissions";
import { requireMembership } from "@/features/auth/workspace";
import { getChairFillerSummary } from "@/features/chair-filler/queries";
import { invoiceStats } from "@/features/invoices/queries";
import { BalanceHero } from "@/features/payments/components/balance-hero";
import { WithdrawDialog } from "@/features/payments/components/withdraw-dialog";
import {
  collectionsData,
  getBalance,
  listTransactions,
  sumOnDay,
} from "@/features/payments/queries";
import { patientNames } from "@/features/patients/queries";
import { listAppointments } from "@/features/scheduling/queries";
import { STATUS_LABEL, STATUS_TONE } from "@/features/scheduling/status";
import {
  dayBoundsUtc,
  formatDateShort,
  formatTime,
  lastMonths,
  nextBusinessDay,
  todayIn,
  zonedToUtcIso,
} from "@/lib/datetime";
import { formatPHP } from "@/lib/money";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Dashboard" };

const greeting = (hour: number) =>
  hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
const MONTH = new Intl.DateTimeFormat("en-PH", { month: "short", timeZone: "UTC" });

function Tile({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <Card className="flex flex-col gap-1 p-6">
      <span className="text-muted text-sm">{label}</span>
      <span className="tabular text-2xl font-semibold tracking-tight">{value}</span>
      <span className="text-muted text-sm">{hint}</span>
    </Card>
  );
}

export default async function DashboardPage() {
  const { user, membership } = await requireMembership();
  const clinic = membership.clinic;
  const tz = clinic.timezone;
  const role = membership.role;
  const now = new Date();
  const today = todayIn(tz, now);
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", { hour: "numeric", hour12: false, timeZone: tz }).format(now),
  );
  const date = new Intl.DateTimeFormat("en-PH", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: tz,
  }).format(now);
  const firstName = user.fullName?.split(/\s+/)[0] ?? "there";

  const showMoney = can(role, "payments.manage");
  const showInvoices = can(role, "invoices.create");
  const showSchedule = can(role, "schedule.view");
  const monthStartIso = zonedToUtcIso(`${today.slice(0, 8)}01`, "00:00", tz);
  const months = lastMonths(today, 12);
  const sinceIso = zonedToUtcIso(`${months[0]}-01`, "00:00", tz);
  const { start, end } = dayBoundsUtc(today, tz);

  const showRecovered = can(role, "staff.manage");
  const [balance, collections, tx, inv, todays, recovered] = await Promise.all([
    showMoney ? getBalance(clinic.id) : Promise.resolve(0),
    showMoney ? collectionsData(clinic.id, sinceIso, tz) : Promise.resolve(null),
    showMoney ? listTransactions(clinic.id, 5) : Promise.resolve(null),
    showInvoices ? invoiceStats(clinic.id, today, monthStartIso) : Promise.resolve(null),
    showSchedule
      ? listAppointments(clinic.id, { fromIso: start, toIso: end })
      : Promise.resolve([]),
    showRecovered ? getChairFillerSummary(clinic.id) : Promise.resolve(null),
  ]);
  const names = showSchedule
    ? await patientNames(
        clinic.id,
        todays.map((a) => a.patient_id),
      )
    : new Map();

  const collectedToday = collections
    ? sumOnDay(
        collections.rows.map((r) => ({ amount_centavos: r.amount_centavos, paid_at: r.paid_at })),
        today,
        tz,
      )
    : null;
  const pendingPayouts = tx
    ? tx.payouts.filter((p) => p.status === "processing").reduce((a, p) => a + p.amount_centavos, 0)
    : 0;
  const nowIso = now.toISOString();
  const remaining = todays.filter(
    (a) => a.ends_at > nowIso && (a.status === "scheduled" || a.status === "confirmed"),
  );
  const monthTotals = months.map((m) => collections?.byMonth.get(m) ?? 0);
  const maxMonth = Math.max(1, ...monthTotals);
  const yearTotal = monthTotals.reduce((a, b) => a + b, 0);
  const canOpenPatients = can(role, "patients.directory");

  return (
    <>
      <PageHeader eyebrow={date} title={`${greeting(hour)}, ${firstName}`} />

      {showMoney ? (
        <div className="grid items-stretch gap-6 lg:grid-cols-[1.5fr_1fr]">
          <BalanceHero centavos={balance}>
            <WithdrawDialog available={balance} arrives={formatDateShort(nextBusinessDay(today))} />
          </BalanceHero>
          <Card className="flex flex-col gap-4">
            <div className="flex items-baseline justify-between gap-3">
              <CardTitle>Collections</CardTitle>
              <span className="tabular text-muted text-sm">Last 12 months</span>
            </div>
            <p className="tabular text-3xl font-semibold tracking-tight">{formatPHP(yearTotal)}</p>
            <div
              className="flex h-28 items-end gap-1.5"
              role="img"
              aria-label={`Collections by month, total ${formatPHP(yearTotal)}`}
            >
              {monthTotals.map((v, i) => (
                <div
                  key={months[i]}
                  className="flex h-full flex-1 flex-col items-center justify-end gap-1"
                >
                  <div
                    className={cn("w-full rounded-t-[4px]", v > 0 ? "bg-mint-strong" : "bg-subtle")}
                    style={{ height: `${Math.max(4, (v / maxMonth) * 100)}%` }}
                  />
                </div>
              ))}
            </div>
            <div className="text-muted flex justify-between text-xs" aria-hidden="true">
              <span>{MONTH.format(new Date(`${months[0]}-01T00:00:00Z`))}</span>
              <span>{MONTH.format(new Date(`${months[months.length - 1]}-01T00:00:00Z`))}</span>
            </div>
            <table className="sr-only">
              <caption>Collections by month</caption>
              <tbody>
                {months.map((m, i) => (
                  <tr key={m}>
                    <th scope="row">{m}</th>
                    <td>{formatPHP(monthTotals[i] ?? 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>
      ) : null}

      <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-5">
        {collectedToday ? (
          <Tile
            label="Collected today"
            value={formatPHP(collectedToday.centavos)}
            hint={`${collectedToday.count} ${collectedToday.count === 1 ? "payment" : "payments"}`}
          />
        ) : null}
        {inv ? (
          <Tile
            label="Outstanding"
            value={formatPHP(inv.open.centavos)}
            hint={`${inv.open.count} unpaid ${inv.open.count === 1 ? "invoice" : "invoices"}${inv.overdue.count ? ` · ${inv.overdue.count} overdue` : ""}`}
          />
        ) : null}
        {recovered ? (
          <Tile
            label="Recovered by Dr. Pill (estimate)"
            value={
              recovered.recoveredCentavos === null
                ? "Not set"
                : formatPHP(recovered.recoveredCentavos)
            }
            hint={
              recovered.recoveredCentavos === null
                ? "Set a typical visit value in Settings"
                : `${recovered.kept} kept of ${recovered.filled} filled slots`
            }
          />
        ) : null}
        {showMoney ? (
          <Tile label="Pending payouts" value={formatPHP(pendingPayouts)} hint="Demo payouts" />
        ) : null}
        {showSchedule ? (
          <Tile
            label="Appointments"
            value={String(todays.filter((a) => a.status !== "cancelled").length)}
            hint={`${remaining.length} remaining today`}
          />
        ) : null}
      </div>

      <div className="grid items-stretch gap-6 lg:grid-cols-2">
        {tx ? (
          <Card className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-3">
              <CardTitle>Recent transactions</CardTitle>
              <Link
                href="/payments"
                className="inline-flex min-h-11 items-center text-sm font-medium underline underline-offset-4"
              >
                View all
              </Link>
            </div>
            {tx.items.length === 0 ? (
              <p className="text-muted">No transactions yet.</p>
            ) : (
              <ul className="divide-line flex flex-col divide-y">
                {tx.items.map((t) => (
                  <li
                    key={`${t.kind}-${t.id}`}
                    className="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{t.title}</p>
                      <p className="text-muted truncate text-sm">{t.subtitle}</p>
                    </div>
                    <Chip
                      tone={t.status === "paid" || t.status === "completed" ? "success" : "pending"}
                    >
                      {t.status === "paid"
                        ? "Paid"
                        : t.status === "completed"
                          ? "Completed"
                          : t.status === "processing"
                            ? "Processing"
                            : "Pending"}
                    </Chip>
                    <span
                      className={cn(
                        "tabular w-28 text-right font-semibold",
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
        ) : null}

        {showSchedule ? (
          <Card className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-3">
              <CardTitle>Up next</CardTitle>
              <Link
                href="/appointments"
                className="inline-flex min-h-11 items-center text-sm font-medium underline underline-offset-4"
              >
                Open calendar
              </Link>
            </div>
            {remaining.length === 0 ? (
              <p className="text-muted">Nothing else scheduled for today.</p>
            ) : (
              <ul className="divide-line flex flex-col divide-y">
                {remaining.slice(0, 5).map((a) => {
                  const name = names.get(a.patient_id)?.name ?? "Patient";
                  return (
                    <li
                      key={a.id}
                      className="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0"
                    >
                      <span className="tabular w-20 text-sm font-medium">
                        {formatTime(a.starts_at, tz)}
                      </span>
                      <div className="min-w-0 flex-1">
                        {canOpenPatients ? (
                          <Link
                            href={`/patients/${a.patient_id}`}
                            className="truncate font-semibold hover:underline"
                          >
                            {name}
                          </Link>
                        ) : (
                          <p className="truncate font-semibold">{name}</p>
                        )}
                        <p className="text-muted truncate text-sm">{a.reason ?? "Appointment"}</p>
                      </div>
                      <Chip tone={STATUS_TONE[a.status]}>{STATUS_LABEL[a.status]}</Chip>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        ) : null}
      </div>
    </>
  );
}
