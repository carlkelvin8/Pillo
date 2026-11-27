"use client";

import { useActionState, useEffect } from "react";
import { Field } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/form-message";
import { Input, Select } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import type { ActionState } from "@/lib/action-state";
import { DEFAULT_TZ, todayIn } from "@/lib/datetime";
import type { Patient } from "@/features/patients/schemas";

type Props = {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  patient?: Patient;
  submitLabel: string;
  onDone?: () => void;
};

/** Add or edit a patient. Demographics only: clinical notes are recorded as visits. */
export function PatientForm({ action, patient, submitLabel, onDone }: Props) {
  const [state, formAction] = useActionState<ActionState, FormData>(action, {});
  useEffect(() => {
    if (state.ok) onDone?.();
  }, [state.ok, onDone]);
  const v = (
    key: "fullName" | "birthdate" | "sex" | "phone" | "email",
    fallback: string | null | undefined,
  ) => state.values?.[key] ?? fallback ?? "";

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <FormMessage state={state} />
      {patient ? <input type="hidden" name="patientId" value={patient.id} /> : null}
      <Field label="Full name" error={state.fieldErrors?.fullName?.[0]}>
        <Input
          name="fullName"
          required
          maxLength={120}
          autoComplete="off"
          defaultValue={v("fullName", patient?.full_name)}
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Birthdate" error={state.fieldErrors?.birthdate?.[0]}>
          <Input
            name="birthdate"
            type="date"
            max={todayIn(DEFAULT_TZ)}
            defaultValue={v("birthdate", patient?.birthdate)}
          />
        </Field>
        <Field label="Sex" error={state.fieldErrors?.sex?.[0]}>
          <Select name="sex" defaultValue={v("sex", patient?.sex)}>
            <option value="">Not specified</option>
            <option value="female">Female</option>
            <option value="male">Male</option>
            <option value="other">Other</option>
          </Select>
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Phone" error={state.fieldErrors?.phone?.[0]}>
          <Input
            name="phone"
            type="tel"
            maxLength={40}
            autoComplete="off"
            defaultValue={v("phone", patient?.phone)}
          />
        </Field>
        <Field label="Email" error={state.fieldErrors?.email?.[0]}>
          <Input
            name="email"
            type="email"
            maxLength={254}
            autoComplete="off"
            defaultValue={v("email", patient?.email)}
          />
        </Field>
      </div>
      <label className="flex min-h-11 items-start gap-3 text-sm">
        <input
          type="checkbox"
          name="consent"
          defaultChecked={Boolean(patient?.consent_at)}
          disabled={Boolean(patient?.consent_at)}
          className="accent-ink mt-1 size-5 shrink-0"
        />
        <span>
          The patient agrees to the clinic keeping their details and contacting them about their
          care. [YOUR PRIVACY NOTICE]
          {patient?.consent_at ? <span className="text-muted block">Consent recorded.</span> : null}
        </span>
      </label>
      <div className="flex justify-end">
        <SubmitButton pendingLabel="Saving…">{submitLabel}</SubmitButton>
      </div>
    </form>
  );
}
