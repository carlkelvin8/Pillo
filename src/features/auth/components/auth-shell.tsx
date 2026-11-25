import Link from "next/link";
import type { ReactNode } from "react";
import { DrPillAvatar } from "@/components/brand/dr-pill-avatar";
import { Logo } from "@/components/brand/logo";
import { APP_NAME, ASSISTANT_NAME } from "@/config/brand";
import { cn } from "@/lib/utils";

const HIGHLIGHTS = ["Scheduling", "Payments", "Records"] as const;

type AuthShellProps = {
  title: string;
  subtitle: string;
  /** Shows the Sign in / Create account switch. */
  tabs?: "signin" | "signup";
  children: ReactNode;
};

/** Split layout shared by the sign-in, sign-up and password screens. */
export function AuthShell({ title, subtitle, tabs, children }: AuthShellProps) {
  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <main className="bg-surface flex flex-1 flex-col justify-between gap-10 px-6 py-10 sm:px-12 lg:px-20 lg:py-12">
        <Link href="/" aria-label={`${APP_NAME} home`} className="w-fit">
          <Logo />
        </Link>

        <div className="flex w-full max-w-105 flex-col gap-7 self-center">
          <div>
            <h1 className="text-title">{title}</h1>
            <p className="text-muted mt-2.5 text-base">{subtitle}</p>
          </div>
          {tabs ? <AuthTabs active={tabs} /> : null}
          {children}
        </div>

        <p className="text-muted text-sm">
          © {new Date().getFullYear()} {APP_NAME}
        </p>
      </main>

      <aside
        aria-label={`About ${ASSISTANT_NAME}`}
        className="bg-mint hidden flex-1 flex-col items-center justify-center gap-7 p-16 text-center lg:flex"
      >
        <DrPillAvatar mood="happy" size={160} decorative />
        <h2 className="text-title max-w-110">Your clinic, running smoothly.</h2>
        <p className="text-mint-ink max-w-100 text-[17px]">
          Meet {ASSISTANT_NAME}, your assistant for bookings, reminders and payments.
        </p>
        <ul className="flex flex-wrap justify-center gap-2.5">
          {HIGHLIGHTS.map((label) => (
            <li key={label} className="bg-surface rounded-full px-4 py-2.5 text-sm font-medium">
              {label}
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
}

function AuthTabs({ active }: { active: "signin" | "signup" }) {
  const base = "inline-flex min-h-11 items-center rounded-full px-4 text-sm font-medium";
  return (
    <nav aria-label="Account" className="flex gap-1.5">
      <Link
        href="/login"
        aria-current={active === "signin" ? "page" : undefined}
        className={cn(
          base,
          active === "signin" ? "bg-ink text-surface" : "text-muted hover:text-ink",
        )}
      >
        Sign in
      </Link>
      <Link
        href="/signup"
        aria-current={active === "signup" ? "page" : undefined}
        className={cn(
          base,
          active === "signup" ? "bg-ink text-surface" : "text-muted hover:text-ink",
        )}
      >
        Create account
      </Link>
    </nav>
  );
}
