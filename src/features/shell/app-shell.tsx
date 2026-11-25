import Link from "next/link";
import type { ReactNode } from "react";
import { Bell, Search } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { APP_NAME } from "@/config/brand";
import type { Role } from "@/features/auth/permissions";
import { navForRole } from "./nav-config";
import { MobileNav } from "./mobile-nav";
import { SidebarNav } from "./sidebar-nav";
import { UserCard } from "./user-card";

type AppShellProps = {
  user: { name: string | null; email: string };
  role: Role;
  clinicName: string;
  children: ReactNode;
};

/** 256px sidebar + top bar (search, notifications) + page content. */
export function AppShell({ user, role, clinicName, children }: AppShellProps) {
  const groups = navForRole(role);
  const sidebarBody = (
    <>
      <SidebarNav groups={groups} />
      <div className="mt-auto">
        <UserCard name={user.name} email={user.email} role={role} />
      </div>
    </>
  );

  return (
    <div className="bg-canvas flex min-h-screen">
      <aside className="w-sidebar border-line bg-surface sticky top-0 hidden h-screen shrink-0 flex-col gap-7 self-start overflow-y-auto border-r px-4 py-5 lg:flex">
        <div className="flex flex-col gap-1 px-1">
          <Link href="/dashboard" aria-label={`${APP_NAME} dashboard`} className="w-fit">
            <Logo />
          </Link>
          <p className="text-muted truncate pl-[42px] text-xs">{clinicName}</p>
        </div>
        {sidebarBody}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sm:px-page flex min-h-22 w-full items-center justify-center px-6 py-5">
          <div className="flex w-full max-w-[96rem] items-center justify-between gap-3">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <MobileNav>
                <div className="flex flex-1 flex-col gap-7">{sidebarBody}</div>
              </MobileNav>
              {/* Search and notifications are placeholders until Patients (Phase 2) and Notifications (Phase 6). */}
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
        <main className="sm:px-page mx-auto flex w-full max-w-[96rem] min-w-0 flex-col gap-8 px-6 pt-2 pb-16">
          {children}
        </main>
      </div>
    </div>
  );
}
