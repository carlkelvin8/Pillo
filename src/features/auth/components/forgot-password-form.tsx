"use client";

import { useActionState } from "react";
import { Field } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/form-message";
import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { requestPasswordResetAction } from "@/features/auth/actions";
import type { ActionState } from "@/lib/action-state";

export function ForgotPasswordForm({ notice }: { notice?: string }) {
  const [state, action] = useActionState<ActionState, FormData>(requestPasswordResetAction, {});
  return (
    <form action={action} className="flex flex-col gap-5">
      {notice && !state.message ? <FormMessage state={{ message: notice }} /> : null}
      <FormMessage state={state} />
      <Field label="Email" error={state.fieldErrors?.email?.[0]}>
        <Input name="email" type="email" autoComplete="email" required />
      </Field>
      <SubmitButton pendingLabel="Sending…" className="min-h-14 w-full text-base">
        Send reset link
      </SubmitButton>
    </form>
  );
}
