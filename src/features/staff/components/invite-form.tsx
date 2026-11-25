"use client";

import { useActionState, useRef } from "react";
import { Field } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/form-message";
import { Input, Select } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { inviteMemberAction } from "@/features/staff/actions";
import { INVITABLE_ROLES } from "@/features/staff/schemas";
import { ROLE_LABELS } from "@/features/auth/permissions";
import type { ActionState } from "@/lib/action-state";

export function InviteForm() {
  const [state, action] = useActionState<ActionState, FormData>(inviteMemberAction, {});
  const formRef = useRef<HTMLFormElement>(null);
  return (
    <form ref={formRef} action={action} className="flex flex-col gap-4">
      <FormMessage state={state} />
      <div className="grid gap-4 sm:grid-cols-[1fr_200px]">
        <Field label="Email" error={state.fieldErrors?.email?.[0]}>
          <Input
            key={state.ok ? "sent" : "editing"}
            name="email"
            type="email"
            required
            autoComplete="off"
            defaultValue={state.ok ? "" : state.values?.email}
          />
        </Field>
        <Field label="Role" error={state.fieldErrors?.role?.[0]}>
          <Select name="role" required defaultValue={state.values?.role ?? "receptionist"}>
            {INVITABLE_ROLES.map((role) => (
              <option key={role} value={role}>
                {ROLE_LABELS[role]}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <div>
        <SubmitButton variant="ghost" pendingLabel="Saving…">
          Add invitation
        </SubmitButton>
      </div>
    </form>
  );
}
