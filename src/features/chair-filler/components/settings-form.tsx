"use client";

import { useActionState } from "react";
import { Field } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/form-message";
import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { saveChairFillerSettingsAction } from "@/features/chair-filler/actions";
import type { ActionState } from "@/lib/action-state";

export function ChairFillerSettingsForm({
  visitValue,
  offerLimit,
}: {
  visitValue: string;
  offerLimit: number;
}) {
  const [state, action] = useActionState<ActionState, FormData>(saveChairFillerSettingsAction, {});
  return (
    <form action={action} className="flex flex-col gap-5">
      <FormMessage state={state} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Typical value of one visit (PHP)"
          hint="Used only for the “recovered” estimate. Leave empty to hide the estimate."
          error={state.fieldErrors?.visitValue?.[0]}
        >
          <Input
            name="visitValue"
            inputMode="decimal"
            placeholder="[YOUR TYPICAL VISIT VALUE]"
            defaultValue={state.values?.visitValue ?? visitValue}
          />
        </Field>
        <Field
          label="Offers drafted per day"
          hint="You approve every offer before anything is sent. 0 turns drafting off."
          error={state.fieldErrors?.offerLimit?.[0]}
        >
          <Input
            name="offerLimit"
            inputMode="numeric"
            defaultValue={state.values?.offerLimit ?? String(offerLimit)}
          />
        </Field>
      </div>
      <div>
        <SubmitButton pendingLabel="Saving…">Save Chair-Filler settings</SubmitButton>
      </div>
    </form>
  );
}
