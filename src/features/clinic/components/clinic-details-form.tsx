"use client";

import { useActionState } from "react";
import { Field } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/form-message";
import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import type { ActionState } from "@/lib/action-state";

type ClinicDetailsFormProps = {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  initial?: {
    name: string;
    address: string | null;
    phone: string | null;
    email: string | null;
    websiteUrl?: string | null;
  };
  submitLabel: string;
};

/** Used by onboarding step 1 (create) and Settings > Clinic profile (update). */
export function ClinicDetailsForm({ action, initial, submitLabel }: ClinicDetailsFormProps) {
  const [state, formAction] = useActionState<ActionState, FormData>(action, {});
  const value = (key: keyof NonNullable<ClinicDetailsFormProps["initial"]>) =>
    state.values?.[key] ?? initial?.[key] ?? "";
  return (
    <form action={formAction} className="flex flex-col gap-5">
      <FormMessage state={state} />
      <Field label="Clinic name" error={state.fieldErrors?.name?.[0]}>
        <Input
          name="name"
          required
          maxLength={120}
          autoComplete="organization"
          defaultValue={value("name")}
        />
      </Field>
      <Field
        label="Address"
        hint="Shown to patients and on invoices."
        error={state.fieldErrors?.address?.[0]}
      >
        <Input
          name="address"
          maxLength={300}
          autoComplete="street-address"
          defaultValue={value("address")}
        />
      </Field>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Phone" error={state.fieldErrors?.phone?.[0]}>
          <Input
            name="phone"
            type="tel"
            maxLength={40}
            autoComplete="tel"
            defaultValue={value("phone")}
          />
        </Field>
        <Field label="Clinic email" error={state.fieldErrors?.email?.[0]}>
          <Input name="email" type="email" maxLength={254} defaultValue={value("email")} />
        </Field>
      </div>
      {initial?.websiteUrl !== undefined ? (
        <Field
          label="Website or public page"
          hint="Patients can open this link from their appointment offer. Use a website or Facebook page URL."
          error={state.fieldErrors?.websiteUrl?.[0]}
        >
          <Input
            name="websiteUrl"
            type="url"
            maxLength={2048}
            autoComplete="url"
            placeholder="https://example.com"
            defaultValue={value("websiteUrl")}
          />
        </Field>
      ) : null}
      <div>
        <SubmitButton pendingLabel="Saving…">{submitLabel}</SubmitButton>
      </div>
    </form>
  );
}
