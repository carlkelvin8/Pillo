import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "@/components/brand/logo";
import { APP_NAME } from "@/config/brand";
import { signOutAction } from "@/features/auth/actions";

export default function OnboardingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="bg-canvas flex min-h-screen flex-col">
      <header className="sm:px-page flex items-center justify-between px-6 py-6">
        <Link href="/" aria-label={`${APP_NAME} home`}>
          <Logo />
        </Link>
        <form action={signOutAction}>
          <button
            type="submit"
            className="text-muted hover:text-ink inline-flex min-h-11 items-center text-sm font-medium"
          >
            Sign out
          </button>
        </form>
      </header>
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-6 pt-4 pb-16">
        {children}
      </main>
    </div>
  );
}
