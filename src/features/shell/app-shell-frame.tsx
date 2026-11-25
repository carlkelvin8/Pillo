"use client";

import { Bell, PanelLeftClose, PanelLeftOpen, Search } from "lucide-react";
import { useState, type ReactNode } from "react";
import type { Role } from "@/features/auth/permissions";
import { DrPillCompanion } from "./dr-pill-companion";
import { MobileNav } from "./mobile-nav";

export function AppShellFrame({
  role,
  sidebarHeader,
  sidebarBody,
  children,
}: {
  role: Role;
  sidebarHeader: ReactNode;
  sidebarBody: ReactNode;
  children: ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div
      className="app-shell bg-canvas flex min-h-screen"
      data-testid="app-shell"
      data-sidebar-collapsed={collapsed}
    >
      <aside
        id="app-sidebar"
        aria-label="Primary sidebar"
        className="app-sidebar w-sidebar border-line bg-surface sticky top-0 hidden h-screen shrink-0 flex-col gap-7 self-start overflow-y-auto border-r px-5 py-5 transition-[width,flex-basis,padding] duration-200 motion-reduce:transition-none lg:flex"
        style={collapsed ? { width: "4.5rem", flexBasis: "4.5rem" } : undefined}
      >
        {sidebarHeader}
        {sidebarBody}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sm:px-page flex min-h-22 w-full items-center justify-center px-6 py-5">
          <div className="flex w-full max-w-[112rem] items-center justify-between gap-3">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <MobileNav>
                <div className="flex flex-1 flex-col gap-7">
                  {sidebarHeader}
                  {sidebarBody}
                </div>
              </MobileNav>
              <button
                type="button"
                aria-label="Toggle sidebar width"
                aria-controls="app-sidebar"
                aria-expanded={!collapsed}
                title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
                onClick={() => setCollapsed((value) => !value)}
                className="rounded-control border-line bg-surface text-ink hover:bg-subtle focus-visible:outline-ink hidden size-11 shrink-0 items-center justify-center border transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 lg:inline-flex"
              >
                {collapsed ? (
                  <PanelLeftOpen className="size-5" aria-hidden="true" />
                ) : (
                  <PanelLeftClose className="size-5" aria-hidden="true" />
                )}
              </button>
              {/* Search and notifications are placeholders until their features are available. */}
              <label className="rounded-control border-line bg-surface text-muted flex min-h-11 max-w-90 flex-1 items-center gap-2.5 border px-4">
                <Search className="size-4 shrink-0" aria-hidden="true" />
                <span className="sr-only">Search</span>
                <input
                  type="search"
                  disabled
                  placeholder="Search coming soon"
                  className="placeholder:text-muted w-full min-w-0 bg-transparent text-sm outline-none"
                />
              </label>
            </div>
            <button
              type="button"
              disabled
              aria-label="Notifications (coming soon)"
              className="rounded-control border-line bg-surface text-ink inline-flex size-11 shrink-0 items-center justify-center border disabled:opacity-50"
            >
              <Bell className="size-[18px]" aria-hidden="true" />
            </button>
          </div>
        </header>
        <main className="sm:px-page mx-auto flex w-full max-w-[112rem] min-w-0 flex-col gap-8 px-6 pt-2 pb-16">
          {children}
        </main>
      </div>
      <DrPillCompanion role={role} />
    </div>
  );
}
