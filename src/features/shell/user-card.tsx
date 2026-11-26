import { LogOut } from "lucide-react";
import { signOutAction } from "@/features/auth/actions";
import { ROLE_LABELS, type Role } from "@/features/auth/permissions";
import { initials } from "@/lib/initials";

type UserCardProps = { name: string | null; email: string; role: Role };

export function UserCard({ name, email, role }: UserCardProps) {
  const display = name ?? email;
  return (
    <div
      role="group"
      aria-label={`${display}, ${ROLE_LABELS[role]}`}
      className="sidebar-user-card rounded-card border-line flex items-center gap-3 border p-3"
    >
      <span
        aria-hidden="true"
        className="sidebar-user-avatar bg-mint text-mint-ink flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold"
      >
        {initials(display)}
      </span>
      <div className="sidebar-user-copy min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{display}</p>
        <p className="text-muted text-xs">{ROLE_LABELS[role]}</p>
      </div>
      <form action={signOutAction}>
        <button
          type="submit"
          aria-label="Sign out"
          title="Sign out"
          className="sidebar-sign-out rounded-control text-muted hover:bg-subtle hover:text-ink inline-flex size-11 items-center justify-center"
        >
          <LogOut className="size-[18px]" aria-hidden="true" />
        </button>
      </form>
    </div>
  );
}
