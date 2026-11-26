import {
  CalendarDays,
  FileText,
  LayoutDashboard,
  MessageCircle,
  Plug,
  Settings,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { can, type Capability, type Role } from "@/features/auth/permissions";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  capability?: Capability;
  /** Highlight this item for every route under the prefix. */
  matchPrefix?: string;
};
export type NavGroup = { label: string; items: NavItem[] };

const NAV: NavGroup[] = [
  {
    label: "Workspace",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      {
        href: "/appointments",
        label: "Appointments",
        icon: CalendarDays,
        capability: "schedule.view",
      },
      { href: "/patients", label: "Patients", icon: Users, capability: "patients.directory" },
    ],
  },
  {
    label: "Money",
    items: [
      { href: "/payments", label: "Payments", icon: Wallet, capability: "payments.manage" },
      { href: "/invoices", label: "Invoices", icon: FileText, capability: "invoices.create" },
    ],
  },
  {
    label: "Assistant",
    items: [
      { href: "/dr-pill", label: "Dr. Pill", icon: MessageCircle, capability: "inbox.view" },
      {
        href: "/integrations",
        label: "Integrations",
        icon: Plug,
        capability: "integrations.manage",
      },
    ],
  },
  {
    label: "Settings",
    items: [
      {
        href: "/settings/clinic",
        label: "Settings",
        icon: Settings,
        capability: "staff.manage",
        matchPrefix: "/settings",
      },
    ],
  },
];

/** Navigation filtered to what this role may open. Empty groups are dropped. */
export function navForRole(role: Role): NavGroup[] {
  return NAV.map((group) => ({
    ...group,
    items: group.items.filter((item) => !item.capability || can(role, item.capability)),
  })).filter((group) => group.items.length > 0);
}
