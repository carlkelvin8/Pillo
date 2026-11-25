"use client";

import { useActionState } from "react";
import { Field } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/form-message";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { SubmitButton } from "@/components/ui/submit-button";
import { signUpAction } from "@/features/auth/actions";
import type { ActionState } from "@/lib/action-state";

export function SignUpForm() {
  const [state, action] = useActionState<ActionState, FormData>(signUpAction, {});
  if (state.ok) return <FormMessage state={state} />;
  return (
    <form action={action} className="flex flex-col gap-5">
      <FormMessage state={state} />
      <Field label="Your name" error={state.fieldErrors?.fullName?.[0]}>
        <Input name="fullName" autoComplete="name" required defaultValue={state.values?.fullName} />
      </Field>
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
      <Field
        label="Password"
        hint="At least 8 characters."
        error={state.fieldErrors?.password?.[0]}
      >
        <PasswordInput name="password" autoComplete="new-password" required minLength={8} />
      </Field>
      <SubmitButton pendingLabel="Creating account…" className="min-h-14 w-full text-base">
        Create account
      </SubmitButton>
      <p className="text-muted text-sm">
        You will set up your clinic next. By continuing you agree to the terms and privacy notice
        [YOUR LINKS].
      </p>
    </form>
  );
}
