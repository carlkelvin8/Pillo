import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/features/auth/components/auth-shell";
import { ForgotPasswordForm } from "@/features/auth/components/forgot-password-form";

export const metadata: Metadata = { title: "Reset password" };

type Props = { searchParams: Promise<{ error?: string }> };

export default async function ForgotPasswordPage({ searchParams }: Props) {
  const params = await searchParams;
  return (
    <AuthShell title="Reset your password" subtitle="We will email you a link to choose a new one.">
      <ForgotPasswordForm
        notice={
          params.error === "link" ? "That reset link has expired. Request a new one." : undefined
        }
      />
      <Link
        href="/login"
        className="inline-flex min-h-11 w-fit items-center text-sm font-medium underline-offset-4 hover:underline"
      >
        Back to sign in
      </Link>
    </AuthShell>
  );
}
