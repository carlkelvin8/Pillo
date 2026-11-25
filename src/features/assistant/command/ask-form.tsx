"use client";

import { useActionState } from "react";
import { DrPillAvatar } from "@/components/brand/dr-pill-avatar";
import { Field } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/form-message";
import { SubmitButton } from "@/components/ui/submit-button";
import type { ActionState } from "@/lib/action-state";
import { askOwnerAction } from "./actions";

const EXAMPLES = [
  "How much did we collect this month compared to last month?",
  "What's our no-show rate in the last 30 days?",
  "How much is overdue in invoices?",
];

export function AskForm() {
  const [state, action] = useActionState<ActionState, FormData>(askOwnerAction, {});
  return (
    <div className="flex flex-col gap-6">
      <form action={action} className="flex flex-col gap-4">
        <FormMessage state={state} />
        <Field
          label="Your question"
          hint="Dr. Pill answers only from your clinic's numbers. Nothing you ask is saved."
          error={state.fieldErrors?.question?.[0]}
        >
          <textarea
            name="question"
            rows={3}
            maxLength={500}
            required
            defaultValue={state.values?.question}
            placeholder={EXAMPLES[0]}
            className="rounded-control border-line-strong bg-surface placeholder:text-muted min-h-11 w-full border px-4 py-2.5 text-sm"
          />
        </Field>
        <div>
          <SubmitButton pendingLabel="Checking your numbers…">Ask</SubmitButton>
        </div>
      </form>
      {state.data?.reply ? (
        <div className="bg-subtle rounded-card flex gap-4 p-5">
          <DrPillAvatar mood="happy" size={48} decorative />
          <p className="min-w-0 whitespace-pre-wrap">{state.data.reply}</p>
        </div>
      ) : null}
      <ul className="text-muted flex flex-col gap-1 text-sm">
        {EXAMPLES.map((e) => (
          <li key={e}>Try: {e}</li>
        ))}
      </ul>
    </div>
  );
}
