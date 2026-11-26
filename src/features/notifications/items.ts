import { can, type Role } from "@/features/auth/permissions";

export type NotificationCounts = {
  needsHuman: number;
  proposedOffers: number;
  overdueInvoices: number;
  unconfirmedToday: number;
};
export type NotificationItem = {
  id: keyof NotificationCounts;
  title: string;
  detail: string;
  href: string;
  count: number;
};

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Pure: turns counts into alert rows for what this role may see. Counts only: never patient names. */
export function buildNotificationItems(role: Role, c: NotificationCounts): NotificationItem[] {
  const items: NotificationItem[] = [];
  if (can(role, "inbox.view") && c.needsHuman > 0)
    items.push({
      id: "needsHuman",
      title: "Chats waiting for staff",
      detail: `${plural(c.needsHuman, "conversation needs", "conversations need")} a reply.`,
      href: "/dr-pill?filter=needs",
      count: c.needsHuman,
    });
  if (can(role, "inbox.view") && c.proposedOffers > 0)
    items.push({
      id: "proposedOffers",
      title: "Slot offers to approve",
      detail: `${plural(c.proposedOffers, "open slot offer is", "open slot offers are")} waiting for approval.`,
      href: "/dr-pill/activity",
      count: c.proposedOffers,
    });
  if (can(role, "invoices.create") && c.overdueInvoices > 0)
    items.push({
      id: "overdueInvoices",
      title: "Overdue invoices",
      detail: `${plural(c.overdueInvoices, "invoice is", "invoices are")} past due.`,
      href: "/invoices?filter=overdue",
      count: c.overdueInvoices,
    });
  if (can(role, "schedule.view") && c.unconfirmedToday > 0)
    items.push({
      id: "unconfirmedToday",
      title: "Unconfirmed appointments today",
      detail: `${plural(c.unconfirmedToday, "appointment is", "appointments are")} still not confirmed.`,
      href: "/appointments",
      count: c.unconfirmedToday,
    });
  return items;
}

export const totalCount = (items: NotificationItem[]) =>
  items.reduce((sum, item) => sum + item.count, 0);
