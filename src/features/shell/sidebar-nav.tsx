import { NavLink } from "@/components/ui/nav-link";
import type { NavGroup } from "./nav-config";

/** Grouped primary navigation (Workspace, Money, Assistant). */
export function SidebarNav({ groups }: { groups: NavGroup[] }) {
  return (
    <nav aria-label="Primary" className="flex flex-col gap-7">
      {groups.map((group) => (
        <div key={group.label} className="flex flex-col gap-1">
          <p className="text-muted px-3 pb-1 text-xs font-semibold tracking-wide uppercase">
            {group.label}
          </p>
          <ul className="flex flex-col gap-1">
            {group.items.map(({ href, label, icon: Icon, matchPrefix }) => (
              <li key={href}>
                <NavLink
                  href={href}
                  matchPrefix={matchPrefix}
                  className="rounded-control text-ink-2 hover:bg-subtle flex min-h-11 items-center gap-3 px-3 text-sm font-medium"
                  activeClassName="bg-ink text-surface hover:bg-ink"
                >
                  <Icon className="size-[18px] shrink-0" aria-hidden="true" />
                  {label}
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}
