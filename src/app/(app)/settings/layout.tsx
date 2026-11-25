import type { ReactNode } from "react";
import { NavLink } from "@/components/ui/nav-link";
import { requireCapability } from "@/features/auth/workspace";

const LINKS = [
  { href: "/settings/clinic", label: "Clinic profile" },
  { href: "/settings/staff", label: "Staff and roles" },
  { href: "/settings/branches", label: "Branches and hours" },
  { href: "/settings/doctors", label: "Doctors" },
  { href: "/settings/notifications", label: "Notifications" },
  { href: "/settings/dr-pill", label: "Dr. Pill" },
] as const;

export default async function SettingsLayout({ children }: { children: ReactNode }) {
  const { membership } = await requireCapability("staff.manage");
  return (
    <div className="flex flex-col gap-8 lg:flex-row">
      <nav aria-label="Settings" className="flex shrink-0 flex-col gap-2 lg:w-56">
        <p className="px-3 text-sm font-semibold">{membership.clinic.name}</p>
        <ul className="flex flex-row flex-wrap gap-1 lg:flex-col">
          {LINKS.map(({ href, label }) => (
            <li key={href}>
              <NavLink
                href={href}
                className="rounded-control text-ink-2 hover:bg-subtle flex min-h-11 items-center px-3 text-sm font-medium"
                activeClassName="bg-mint text-mint-ink hover:bg-mint"
              >
                {label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
      <div className="flex min-w-0 flex-1 flex-col gap-8">{children}</div>
    </div>
  );
}
