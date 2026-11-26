import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "@/components/brand/logo";
import { APP_NAME } from "@/config/brand";
import type { Role } from "@/features/auth/permissions";
import { navForRole } from "./nav-config";
import { ClinicIdentity } from "./clinic-identity";
import { SidebarNav } from "./sidebar-nav";
import { UserCard } from "./user-card";
import { AppShellFrame } from "./app-shell-frame";

type AppShellProps = {
  user: { name: string | null; email: string };
  role: Role;
  clinicName: string;
  children: ReactNode;
};

/** Sidebar (240-272px, collapsible to 72px) + top bar (search, notifications) + page content. */
export function AppShell({ user, role, clinicName, children }: AppShellProps) {
  const groups = navForRole(role);
  const sidebarHeader = (
    <div className="flex flex-col gap-3 px-1">
      <Link
        href="/dashboard"
        aria-label={`${APP_NAME} dashboard`}
        className="sidebar-brand-link w-fit"
      >
        <Logo className="[&_svg]:size-10" />
      </Link>
      <ClinicIdentity clinicName={clinicName} />
    </div>
  );
  const sidebarBody = (
    <>
      <SidebarNav groups={groups} />
      <div className="mt-auto">
        <UserCard name={user.name} email={user.email} role={role} />
      </div>
    </>
  );

  return (
    <AppShellFrame role={role} sidebarHeader={sidebarHeader} sidebarBody={sidebarBody}>
      {children}
    </AppShellFrame>
  );
}
