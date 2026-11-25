"use client";

import { useActionState } from "react";
import { Field } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/form-message";
import { PasswordInput } from "@/components/ui/password-input";
import { SubmitButton } from "@/components/ui/submit-button";
import { updatePasswordAction } from "@/features/auth/actions";
import type { ActionState } from "@/lib/action-state";

export function ResetPasswordForm() {
  const [state, action] = useActionState<ActionState, FormData>(updatePasswordAction, {});
  return (
    <form action={action} className="flex flex-col gap-5">
      <FormMessage state={state} />
      <Field
        label="New password"
        hint="At least 8 characters."
        error={state.fieldErrors?.password?.[0]}
      >
        <PasswordInput name="password" autoComplete="new-password" required minLength={8} />
      </Field>
      <Field label="Confirm new password" error={state.fieldErrors?.confirm?.[0]}>
        <PasswordInput name="confirm" autoComplete="new-password" required minLength={8} />
      </Field>
      <SubmitButton pendingLabel="Saving…" className="min-h-14 w-full text-base">
        Update password
      </SubmitButton>
    </form>
  );
}
