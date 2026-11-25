"use client";

import { useActionState } from "react";
import { Field } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/form-message";
import { Input, Select } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { saveAgentRulesAction } from "@/features/assistant/actions";
import type { ActionState } from "@/lib/action-state";

type Props = {
  bookingAutonomy: "auto" | "suggest" | "approve";
  bookingLimit: number;
  replyLimit: number;
};

export function RulesForm({ bookingAutonomy, bookingLimit, replyLimit }: Props) {
  const [state, action] = useActionState<ActionState, FormData>(saveAgentRulesAction, {});
  return (
    <form action={action} className="flex flex-col gap-5">
      <FormMessage state={state} />
      <Field
        label="When a patient wants to book"
        hint="Either way, a person can always see and change the appointment on the calendar."
      >
        <Select
          name="bookingAutonomy"
          defaultValue={bookingAutonomy === "auto" ? "auto" : "suggest"}
        >
          <option value="auto">Dr. Pill books it by itself (shows as booked by Dr. Pill)</option>
          <option value="suggest">Dr. Pill collects the details and my team books it</option>
        </Select>
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Bookings per day"
          hint="After this, Dr. Pill hands over to your team."
          error={state.fieldErrors?.bookingLimit?.[0]}
        >
          <Input
            name="bookingLimit"
            inputMode="numeric"
            defaultValue={state.values?.bookingLimit ?? String(bookingLimit)}
          />
        </Field>
        <Field
          label="Replies per day"
          hint="Caps AI usage. After this, your team takes over."
          error={state.fieldErrors?.replyLimit?.[0]}
        >
          <Input
            name="replyLimit"
            inputMode="numeric"
            defaultValue={state.values?.replyLimit ?? String(replyLimit)}
          />
        </Field>
      </div>
      <div>
        <SubmitButton pendingLabel="Saving…">Save limits</SubmitButton>
      </div>
    </form>
  );
}
