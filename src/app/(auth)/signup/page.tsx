import type { Metadata } from "next";
import { AuthShell } from "@/features/auth/components/auth-shell";
import { SignUpForm } from "@/features/auth/components/sign-up-form";

export const metadata: Metadata = { title: "Create account" };

export default function SignUpPage() {
  return (
    <AuthShell
      title="Create your account"
      subtitle="Start with your own login. Add your clinic next."
      tabs="signup"
    >
      <SignUpForm />
    </AuthShell>
  );
}
