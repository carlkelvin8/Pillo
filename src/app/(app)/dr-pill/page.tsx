import type { Metadata } from "next";
import Link from "next/link";
import { DrPillAvatar } from "@/components/brand/dr-pill-avatar";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { DrPillTabs } from "@/features/assistant/components/dr-pill-tabs";
import { can } from "@/features/auth/permissions";
import { requireCapability } from "@/features/auth/workspace";
import {
  AutoRefresh,
  ConversationControls,
  ReplyForm,
} from "@/features/assistant/components/inbox-controls";
import {
  conversationMessages,
  getConversation,
  lastMessages,
  listConversations,
  needsHumanCount,
  REASON_LABEL,
  type ConversationRow,
  type InboxFilter,
} from "@/features/assistant/queries";
import { patientNames } from "@/features/patients/queries";
import { dateOf, formatDateShort, formatTime, todayIn } from "@/lib/datetime";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Dr. Pill" };

type Props = { searchParams: Promise<{ c?: string; filter?: string }> };

function statusChip(c: ConversationRow) {
  if (c.status === "needs_human") return <Chip tone="danger">Needs a human</Chip>;
  if (c.status === "resolved") return <Chip tone="neutral">Resolved</Chip>;
  return c.handled_by === "human" ? (
    <Chip tone="pending">With staff</Chip>
  ) : (
    <Chip tone="success">Dr. Pill</Chip>
  );
}

export default async function InboxPage({ searchParams }: Props) {
  const { membership } = await requireCapability("inbox.view");
  const params = await searchParams;
  const clinic = membership.clinic;
  const tz = clinic.timezone;
  const today = todayIn(tz);
  const filter: InboxFilter = params.filter === "needs" ? "needs" : "all";
  const selectedId = params.c && /^[0-9a-f-]{36}$/i.test(params.c) ? params.c : undefined;

  const [list, needs] = await Promise.all([
    listConversations(clinic.id, filter),
    needsHumanCount(clinic.id),
  ]);
  const previews = await lastMessages(list.map((c) => c.id));
  const selected = selectedId ? await getConversation(clinic.id, selectedId) : null;
  const messages = selected ? await conversationMessages(selected.id) : [];
  const linked = [...list, ...(selected ? [selected] : [])]
    .map((c) => c.patient_id)
    .filter((x): x is string => Boolean(x));
  const names = await patientNames(clinic.id, linked);

  const when = (iso: string) =>
    dateOf(iso, tz) === today ? formatTime(iso, tz) : formatDateShort(dateOf(iso, tz));
  const label = (c: ConversationRow) =>
    c.patient_id
      ? (names.get(c.patient_id)?.name ?? "Patient")
      : `Web visitor · ${when(c.created_at)}`;
  const href = (id?: string, f: InboxFilter = filter) => {
    const q = new URLSearchParams();
    if (f === "needs") q.set("filter", "needs");
    if (id) q.set("c", id);
    const s = q.toString();
    return s ? `/dr-pill?${s}` : "/dr-pill";
  };

  return (
    <>
      <AutoRefresh />
      <PageHeader eyebrow="Assistant" title="Dr. Pill" />
      <DrPillTabs active="conversations" isOwner={can(membership.role, "staff.manage")} />

      <div className="grid items-stretch gap-6 lg:grid-cols-[360px_1fr]">
        <Card className="flex flex-col gap-3 p-3">
          <div className="flex gap-1.5 px-1 pt-1">
            <Link
              href={href(selectedId, "all")}
              aria-current={filter === "all" ? "page" : undefined}
              className={cn(
                "inline-flex min-h-11 items-center rounded-full px-4 text-sm font-medium",
                filter === "all" ? "bg-ink text-surface" : "text-muted hover:text-ink",
              )}
            >
              All
            </Link>
            <Link
              href={href(selectedId, "needs")}
              aria-current={filter === "needs" ? "page" : undefined}
              className={cn(
                "inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-sm font-medium",
                filter === "needs" ? "bg-ink text-surface" : "text-muted hover:text-ink",
              )}
            >
              Needs a human
              {needs > 0 ? (
                <span className="tabular bg-danger-chip text-danger-chip-ink rounded-full px-2 text-xs font-semibold">
                  {needs}
                </span>
              ) : null}
            </Link>
          </div>
          {list.length === 0 ? (
            <div className="flex flex-col items-center gap-3 px-4 py-10 text-center">
              <DrPillAvatar mood="sleepy" size={72} decorative />
              <p className="text-muted">
                {filter === "needs"
                  ? "Nothing needs a human right now."
                  : "No conversations yet. Share your chat link from Settings to get started."}
              </p>
            </div>
          ) : (
            <ul className="flex flex-col">
              {list.map((c) => (
                <li key={c.id}>
                  <Link
                    href={href(c.id)}
                    aria-current={c.id === selectedId ? "true" : undefined}
                    className={cn(
                      "rounded-control hover:bg-canvas flex min-h-11 flex-col gap-1 px-3 py-3",
                      c.id === selectedId && "bg-canvas",
                    )}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate font-semibold">{label(c)}</span>
                      <span className="tabular text-muted shrink-0 text-xs">
                        {when(c.last_message_at)}
                      </span>
                    </span>
                    <span className="text-muted truncate text-sm">
                      {previews.get(c.id) ?? "No messages"}
                    </span>
                    <span>{statusChip(c)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="flex min-h-96 flex-col gap-4">
          {!selected ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 py-16 text-center">
              <DrPillAvatar mood="happy" size={88} decorative />
              <p className="text-muted">Choose a conversation to read it and reply.</p>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-card-title">{label(selected)}</h2>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    {statusChip(selected)}
                    {selected.handoff_reason ? (
                      <Chip tone="neutral">{REASON_LABEL[selected.handoff_reason]}</Chip>
                    ) : null}
                  </div>
                </div>
                <ConversationControls
                  conversationId={selected.id}
                  handledBy={selected.handled_by}
                  status={selected.status}
                />
              </div>
              {selected.handoff_summary ? (
                <p
                  role="note"
                  className="rounded-control bg-amber-chip text-amber-chip-ink p-4 text-sm"
                >
                  <span className="font-semibold">Dr. Pill says: </span>
                  {selected.handoff_summary}
                </p>
              ) : null}
              <ol
                aria-label="Messages"
                className="flex max-h-[28rem] flex-col gap-3 overflow-y-auto"
              >
                {messages.map((m) => (
                  <li
                    key={m.id}
                    className={cn(
                      "flex flex-col gap-1",
                      m.role === "patient" ? "items-start" : "items-end",
                    )}
                  >
                    <span className="text-muted text-xs">
                      {m.role === "patient"
                        ? "Patient"
                        : m.role === "assistant"
                          ? "Dr. Pill"
                          : m.role === "staff"
                            ? "Staff"
                            : "System"}{" "}
                      · <span className="tabular">{formatTime(m.created_at, tz)}</span>
                    </span>
                    <p
                      className={cn(
                        "rounded-card max-w-[85%] px-4 py-2.5 text-sm whitespace-pre-line",
                        m.role === "patient" && "border-line-strong bg-surface border",
                        m.role === "assistant" && "bg-mint text-ink",
                        m.role === "staff" && "bg-ink text-surface",
                        m.role === "system" && "bg-subtle text-muted",
                      )}
                    >
                      {m.content}
                    </p>
                  </li>
                ))}
              </ol>
              {selected.status !== "resolved" ? (
                <ReplyForm conversationId={selected.id} />
              ) : (
                <p className="text-muted text-sm">
                  Resolved. If the patient writes again, Dr. Pill picks the chat back up.
                </p>
              )}
            </>
          )}
        </Card>
      </div>
    </>
  );
}
