import type { ReactNode } from "react";
import { requireMembership } from "@/features/auth/workspace";
import { AppShell } from "@/features/shell/app-shell";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const { user, membership } = await requireMembership();
  return (
    <AppShell
      user={{ name: user.fullName, email: user.email }}
      role={membership.role}
      clinicName={membership.clinic.name}
    >
      {children}
    </AppShell>
  );
}
