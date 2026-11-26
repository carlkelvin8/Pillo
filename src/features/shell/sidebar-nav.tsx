import { NavLink } from "@/components/ui/nav-link";
import type { NavGroup } from "./nav-config";

/** Grouped primary navigation (Workspace, Money, Assistant). */
export function SidebarNav({ groups }: { groups: NavGroup[] }) {
  return (
    <nav aria-label="Primary" className="sidebar-nav flex flex-col gap-6">
      {groups.map((group) => (
        <div key={group.label} className="sidebar-nav-group flex flex-col gap-1.5">
          <p className="sidebar-group-label text-muted px-3.5 pb-1 text-[11px] font-semibold tracking-[0.08em] uppercase">
            {group.label}
          </p>
          <ul className="flex flex-col gap-1">
            {group.items.map(({ href, label, icon: Icon, matchPrefix }) => (
              <li key={href}>
                <NavLink
                  href={href}
                  aria-label={label}
                  title={label}
                  matchPrefix={matchPrefix}
                  className="sidebar-nav-link rounded-control text-ink-2 hover:bg-subtle focus-visible:outline-ink flex min-h-11 items-center gap-3 px-3.5 text-sm font-medium transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2"
                  activeClassName="bg-ink text-surface hover:bg-ink font-semibold"
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
