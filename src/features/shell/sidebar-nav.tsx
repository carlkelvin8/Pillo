import { NavLink } from "@/components/ui/nav-link";
import type { NavGroup } from "./nav-config";

/** Grouped primary navigation (Workspace, Money, Assistant). */
export function SidebarNav({ groups }: { groups: NavGroup[] }) {
  return (
    <nav aria-label="Primary" className="flex flex-col gap-8">
      {groups.map((group) => (
        <div key={group.label} className="flex flex-col gap-2">
          <p className="text-muted px-4 pb-1 text-xs font-semibold tracking-wide uppercase">
            {group.label}
          </p>
          <ul className="flex flex-col gap-1.5">
            {group.items.map(({ href, label, icon: Icon, matchPrefix }) => (
              <li key={href}>
                <NavLink
                  href={href}
                  matchPrefix={matchPrefix}
                  className="rounded-control text-ink-2 hover:bg-subtle flex min-h-[55px] items-center gap-4 px-4 text-sm font-medium"
                  activeClassName="bg-ink text-surface hover:bg-ink"
                >
                  <Icon className="size-5 shrink-0" aria-hidden="true" />
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
