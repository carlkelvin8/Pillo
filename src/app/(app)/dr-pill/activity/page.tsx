import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardTitle } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { DrPillTabs } from "@/features/assistant/components/dr-pill-tabs";
import { requireCapability } from "@/features/auth/workspace";
import { OfferActions } from "@/features/chair-filler/components/offer-card";
import { getChairFillerSummary, listOffers } from "@/features/chair-filler/queries";
import { can } from "@/features/auth/permissions";
import {
  ACTION_PAGE_SIZE,
  actionCountsSince,
  listActions,
  listMcpPaymentRequests,
} from "@/features/assistant/queries";
import { McpPaymentRequests } from "@/features/mcp/components/payment-requests";
import { formatPHP } from "@/lib/money";
import { dateOf, formatDateShort, formatTime, todayIn, zonedToUtcIso } from "@/lib/datetime";

export const metadata: Metadata = { title: "Dr. Pill activity" };
type Props = { searchParams: Promise<{ page?: string }> };

const KIND_LABEL: Record<string, string> = {
  book_appointment: "Booked an appointment",
  reschedule_appointment: "Rescheduled an appointment",
  handoff: "Handed a chat to staff",
};

export default async function ActivityPage({ searchParams }: Props) {
  const { membership } = await requireCapability("inbox.view");
  const params = await searchParams;
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);
  const clinic = membership.clinic;
  const tz = clinic.timezone;
  const today = todayIn(tz);
  const canOffers =
    can(membership.role, "inbox.view") &&
    membership.role !== "doctor" &&
    membership.role !== "billing";
  const [{ rows: actions, total: actionTotal }, counts, offers, summary, mcpPaymentRequests] =
    await Promise.all([
      listActions(clinic.id, page),
      actionCountsSince(clinic.id, zonedToUtcIso(today, "00:00", tz)),
      canOffers ? listOffers(clinic.id) : Promise.resolve([]),
      canOffers ? getChairFillerSummary(clinic.id) : Promise.resolve(null),
      canOffers ? listMcpPaymentRequests(clinic.id) : Promise.resolve([]),
    ]);
  const open = offers.filter((o) => o.status === "proposed" || o.status === "sent");
  const actionPages = Math.max(1, Math.ceil(actionTotal / ACTION_PAGE_SIZE));

  return (
    <>
      <PageHeader eyebrow="Assistant" title="Dr. Pill" />
      <DrPillTabs active="activity" isOwner={can(membership.role, "staff.manage")} />

      {summary ? (
        <Card className="flex flex-col gap-1 p-6">
          <span className="text-muted text-sm">Recovered by Chair-Filler (estimate)</span>
          <span className="tabular text-3xl font-semibold tracking-tight">
            {summary.recoveredCentavos === null
              ? "Set your typical visit value"
              : formatPHP(summary.recoveredCentavos)}
          </span>
          <span className="text-muted text-sm">
            {summary.filled} slot{summary.filled === 1 ? "" : "s"} filled, {summary.kept} kept
            (completed visits). The peso figure is kept visits × your typical visit value, not
            measured revenue.
          </span>
        </Card>
      ) : null}

      <div className="grid gap-6 sm:grid-cols-3">
        {[
          ["Replies today", counts.replies],
          ["Bookings today", counts.bookings],
          ["Handed to staff today", counts.handoffs],
        ].map(([label, n]) => (
          <Card key={String(label)} className="flex flex-col gap-1 p-6">
            <span className="text-muted text-sm">{label}</span>
            <span className="tabular text-3xl font-semibold tracking-tight">{n}</span>
          </Card>
        ))}
      </div>

      {canOffers ? (
        <Card className="flex flex-col gap-4">
          <div>
            <CardTitle>MCP payment requests</CardTitle>
            <p className="text-muted">
              MCP clients cannot create payment links directly. Review each request before a link is
              created.
            </p>
          </div>
          <McpPaymentRequests requests={mcpPaymentRequests} />
        </Card>
      ) : null}

      {canOffers ? (
        <Card className="flex flex-col gap-4">
          <div>
            <CardTitle>Open slots to fill</CardTitle>
            <p className="text-muted">
              When an appointment is cancelled, Dr. Pill drafts offers for waitlist patients who
              agreed to be contacted. Nothing is sent until you approve.
            </p>
          </div>
          {open.length === 0 ? (
            <p className="text-muted">
              No offers waiting. They appear after a cancellation or no-show.
            </p>
          ) : (
            <ul className="divide-line flex flex-col divide-y">
              {open.map((o) => (
                <li key={o.id} className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0">
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold">{o.patient?.full_name ?? "Patient"}</p>
                      <p className="text-muted text-sm">
                        <span className="tabular">
                          {formatDateShort(dateOf(o.starts_at, tz))}, {formatTime(o.starts_at, tz)}
                        </span>{" "}
                        · {o.doctor?.display_name ?? "Doctor"}
                      </p>
                    </div>
                    <Chip tone={o.status === "sent" ? "success" : "pending"}>
                      {o.status === "sent" ? "Approved" : "Needs approval"}
                    </Chip>
                  </div>
                  <OfferActions offerId={o.id} sent={o.status === "sent"} />
                </li>
              ))}
            </ul>
          )}
        </Card>
      ) : null}

      <Card className="flex flex-col gap-4">
        <div>
          <CardTitle>What Dr. Pill did</CardTitle>
          <p className="text-muted">
            Every action is logged here. No patient names or message text are stored in this log.
          </p>
        </div>
        {actions.length === 0 ? (
          <p className="text-muted">
            Nothing yet. Actions appear here once patients start chatting.
          </p>
        ) : (
          <ul className="divide-line flex flex-col divide-y">
            {actions.map((a) => (
              <li
                key={a.id}
                className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3 first:pt-0 last:pb-0"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{KIND_LABEL[a.kind] ?? a.kind}</p>
                  <p className="text-muted text-sm">
                    {a.outcome ?? "—"} ·{" "}
                    <span className="tabular">
                      {formatDateShort(dateOf(a.created_at, tz))}, {formatTime(a.created_at, tz)}
                    </span>
                  </p>
                </div>
                <Chip
                  tone={
                    a.status === "executed"
                      ? "success"
                      : a.status === "failed"
                        ? "danger"
                        : "pending"
                  }
                >
                  {a.status === "executed"
                    ? "Done"
                    : a.status === "failed"
                      ? "Failed"
                      : a.status === "proposed"
                        ? "Needs staff"
                        : a.status}
                </Chip>
                {a.conversation_id ? (
                  <Link
                    href={`/dr-pill?c=${a.conversation_id}`}
                    className="inline-flex min-h-11 items-center text-sm font-medium underline underline-offset-4"
                  >
                    Open chat
                  </Link>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        <nav
          aria-label="Activity pages"
          className="border-line flex flex-wrap items-center justify-between gap-3 border-t pt-4"
        >
          <span className="text-muted text-sm">
            Showing {actionTotal === 0 ? 0 : (page - 1) * ACTION_PAGE_SIZE + 1}–
            {Math.min(page * ACTION_PAGE_SIZE, actionTotal)} of {actionTotal} · {ACTION_PAGE_SIZE}{" "}
            per page
          </span>
          <div className="flex gap-2">
            <Link
              aria-disabled={page <= 1}
              tabIndex={page <= 1 ? -1 : undefined}
              className="border-line inline-flex min-h-11 items-center rounded-full border px-4 text-sm aria-disabled:pointer-events-none aria-disabled:opacity-40"
              href={`/dr-pill/activity${page > 2 ? `?page=${page - 1}` : ""}`}
            >
              Previous
            </Link>
            <Link
              aria-disabled={page >= actionPages}
              tabIndex={page >= actionPages ? -1 : undefined}
              className="border-line inline-flex min-h-11 items-center rounded-full border px-4 text-sm aria-disabled:pointer-events-none aria-disabled:opacity-40"
              href={`/dr-pill/activity?page=${Math.min(actionPages, page + 1)}`}
            >
              Next
            </Link>
          </div>
        </nav>
      </Card>
    </>
  );
}
