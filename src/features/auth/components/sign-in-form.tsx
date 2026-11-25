"use client";

import Link from "next/link";
import { useActionState } from "react";
import { FormMessage } from "@/components/ui/form-message";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { SubmitButton } from "@/components/ui/submit-button";
import { signInAction } from "@/features/auth/actions";
import type { ActionState } from "@/lib/action-state";

export function SignInForm({ next, notice }: { next?: string; notice?: string }) {
  const [state, action] = useActionState<ActionState, FormData>(signInAction, {});
  return (
    <form action={action} className="flex flex-col gap-5">
      {notice && !state.message ? <FormMessage state={{ message: notice }} /> : null}
      <FormMessage state={state} />
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <Field label="Email" error={state.fieldErrors?.email?.[0]}>
        <Input
          name="email"
          type="email"
          autoComplete="email"
          required
          placeholder="you@[YOUR-CLINIC]"
          defaultValue={state.values?.email}
        />
      </Field>
      <Field label="Password" error={state.fieldErrors?.password?.[0]}>
        <PasswordInput name="password" autoComplete="current-password" required />
      </Field>
      <div className="flex justify-end text-sm">
        <Link
          href="/forgot-password"
          className="inline-flex min-h-11 items-center font-medium underline-offset-4 hover:underline"
        >
          Forgot password?
        </Link>
      </div>
      <SubmitButton pendingLabel="Signing in…" className="min-h-14 w-full text-base">
        Sign in
      </SubmitButton>
    </form>
  );
}
