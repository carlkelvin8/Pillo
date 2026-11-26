import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardTitle } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { requireCapability } from "@/features/auth/workspace";

export const metadata: Metadata = { title: "Notifications" };

const IN_APP = [
  ["Chats waiting for staff", "Dr. Pill handed a conversation over and it needs a reply."],
  ["Slot offers to approve", "A cancellation opened a slot and offers are waiting for approval."],
  ["Overdue invoices", "Sent invoices past their due date."],
  ["Unconfirmed appointments today", "Today's appointments that are still only scheduled."],
] as const;
const SOON = ["Email reminders", "SMS reminders", "Viber reminders"] as const;

export default async function Page() {
  await requireCapability("staff.manage");
  return (
    <>
      <PageHeader eyebrow="Settings" title="Notifications" />
      <Card className="flex flex-col gap-4">
        <CardTitle>In-app alerts</CardTitle>
        <p className="text-muted text-sm">
          Always on. Open the bell in the top bar to see them. Each alert shows a count and opens
          the right page; no patient details appear in the list.
        </p>
        <ul className="divide-line flex flex-col divide-y">
          {IN_APP.map(([title, detail]) => (
            <li key={title} className="flex flex-wrap items-start justify-between gap-2 py-3">
              <div className="min-w-0">
                <p className="font-semibold">{title}</p>
                <p className="text-muted text-sm">{detail}</p>
              </div>
              <Chip tone="success">On</Chip>
            </li>
          ))}
        </ul>
      </Card>
      <Card className="flex flex-col gap-4">
        <CardTitle>Patient reminders</CardTitle>
        <p className="text-muted text-sm">
          Reminders sent to patients need a sending provider and recorded consent. They are not
          available yet.
        </p>
        <ul className="flex flex-wrap gap-2">
          {SOON.map((name) => (
            <li key={name} className="flex items-center gap-2">
              <span className="text-sm font-medium">{name}</span>
              <Chip tone="neutral">Coming soon</Chip>
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}
