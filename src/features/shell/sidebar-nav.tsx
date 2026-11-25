import { NavLink } from "@/components/ui/nav-link";
import type { NavGroup } from "./nav-config";

/** Grouped primary navigation (Workspace, Money, Assistant). */
export function SidebarNav({ groups }: { groups: NavGroup[] }) {
  return (
    <nav aria-label="Primary" className="sidebar-nav flex flex-col gap-8">
      {groups.map((group) => (
        <div key={group.label} className="sidebar-nav-group flex flex-col gap-2">
          <p className="sidebar-group-label text-muted px-4 pb-1 text-xs font-semibold tracking-wide uppercase">
            {group.label}
          </p>
          <ul className="flex flex-col gap-1.5">
            {group.items.map(({ href, label, icon: Icon, matchPrefix }) => (
              <li key={href}>
                <NavLink
                  href={href}
                  aria-label={label}
                  title={label}
                  matchPrefix={matchPrefix}
                  className="sidebar-nav-link rounded-control text-ink-2 hover:bg-subtle flex min-h-12 items-center gap-3.5 px-3.5 text-sm font-medium transition-colors duration-150"
                  activeClassName="bg-ink text-surface hover:bg-ink"
                >
                  <Icon className="sidebar-nav-icon size-5 shrink-0" aria-hidden="true" />
                  <span className="sidebar-nav-label">{label}</span>
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}
