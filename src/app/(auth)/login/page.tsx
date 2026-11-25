import type { Metadata } from "next";
import { AuthShell } from "@/features/auth/components/auth-shell";
import { SignInForm } from "@/features/auth/components/sign-in-form";
import { safeNext } from "@/lib/safe-redirect";

export const metadata: Metadata = { title: "Sign in" };

type Props = { searchParams: Promise<{ next?: string; error?: string }> };

export default async function LoginPage({ searchParams }: Props) {
  const params = await searchParams;
  return (
    <AuthShell title="Welcome back" subtitle="Sign in to your clinic." tabs="signin">
      <SignInForm
        next={safeNext(params.next) ?? undefined}
        notice={
          params.error === "link"
            ? "That link has expired. Please sign in or request a new one."
            : undefined
        }
      />
    </AuthShell>
  );
}
