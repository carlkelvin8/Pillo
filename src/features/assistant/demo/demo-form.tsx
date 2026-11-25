"use client";

import { useActionState } from "react";
import { DrPillAvatar } from "@/components/brand/dr-pill-avatar";
import { FormMessage } from "@/components/ui/form-message";
import { SubmitButton } from "@/components/ui/submit-button";
import type { ActionState } from "@/lib/action-state";
import { runSyntheticDemoAction } from "./actions";
import { SYNTHETIC_QUESTIONS } from "./run";

export function SyntheticDemoForm({ available }: { available: boolean }) {
  const [state, action] = useActionState<ActionState, FormData>(runSyntheticDemoAction, {});
  const selected = state.values?.question ?? SYNTHETIC_QUESTIONS[0];

  return (
    <div className="flex flex-col gap-5">
      <form action={action} className="flex flex-col gap-4">
        <FormMessage state={state} />
        <fieldset className="flex flex-col gap-2" disabled={!available}>
          <legend className="mb-2 text-sm font-semibold">Choose a sample question</legend>
          {SYNTHETIC_QUESTIONS.map((question) => (
            <label
              key={question}
              className="rounded-control border-line bg-surface flex min-h-12 items-center gap-3 border px-4 py-3 has-[:checked]:border-ink has-[:checked]:bg-subtle"
            >
              <input
                type="radio"
                name="question"
                value={question}
                defaultChecked={selected === question}
                required
                className="accent-ink size-4 shrink-0"
              />
              <span className="text-sm">{question}</span>
            </label>
          ))}
        </fieldset>
        <div>
          <SubmitButton pendingLabel="Asking Gemini…" disabled={!available}>
            Ask Dr. Pill
          </SubmitButton>
        </div>
      </form>
      {state.data?.reply ? (
        <div className="bg-subtle rounded-card flex items-start gap-4 p-5">
          <DrPillAvatar mood="happy" size={48} decorative />
          <div className="min-w-0">
            <p className="mb-2 text-sm font-semibold">Demo Family Dental</p>
            <p className="whitespace-pre-wrap">{state.data.reply}</p>
            <p className="text-muted mt-3 text-xs">Synthetic demo · {state.data.steps} model steps</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
