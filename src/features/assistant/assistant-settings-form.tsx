"use client";

import { useActionState } from "react";
import { FormMessage } from "@/components/ui/form-message";
import { Switch } from "@/components/ui/switch";
import { SubmitButton } from "@/components/ui/submit-button";
import { cn } from "@/lib/utils";
import type { ActionState } from "@/lib/action-state";
import { ASSISTANT_TOGGLES, TONES, TONE_LABELS, type AssistantSettings } from "./settings";

type Props = {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  initial: AssistantSettings;
  submitLabel: string;
  /** Rendered before the submit button, e.g. a Back link. */
  secondary?: React.ReactNode;
};

/** What Dr. Pill helps with, and its tone. Used in onboarding and (later) settings. */
export function AssistantSettingsForm({ action, initial, submitLabel, secondary }: Props) {
  const [state, formAction] = useActionState<ActionState, FormData>(action, {});
  return (
    <form action={formAction} className="flex flex-col gap-7">
      <FormMessage state={state} />
      <section aria-label="What Dr. Pill helps with" className="flex flex-col gap-3">
        {ASSISTANT_TOGGLES.map(({ key, title, hint }) => {
          const id = `toggle-${key}`;
          return (
            <div
              key={key}
              className="rounded-card border-line bg-surface flex items-center justify-between gap-4 border p-5"
            >
              <label
                htmlFor={id}
                className="flex min-h-11 flex-1 cursor-pointer flex-col justify-center"
              >
                <span className="font-semibold">{title}</span>
                <span className="text-muted text-sm">{hint}</span>
              </label>
              <Switch id={id} name={key} defaultChecked={initial[key]} />
            </div>
          );
        })}
      </section>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-3 text-sm font-semibold">Tone</legend>
        <div className="flex flex-wrap gap-2">
          {TONES.map((tone) => (
            <label key={tone} className="relative">
              <input
                type="radio"
                name="tone"
                value={tone}
                defaultChecked={initial.tone === tone}
                className="peer absolute inset-0 size-full cursor-pointer opacity-0"
              />
              <span
                className={cn(
                  "border-line-strong bg-surface inline-flex min-h-11 items-center rounded-full border px-5 text-sm font-medium",
                  "peer-checked:border-ink peer-checked:bg-ink peer-checked:text-surface",
                  "peer-focus-visible:outline-ink peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2",
                )}
              >
                {TONE_LABELS[tone]}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="flex items-center justify-between gap-3">
        {secondary ?? <span />}
        <SubmitButton pendingLabel="Saving…">{submitLabel}</SubmitButton>
      </div>
    </form>
  );
}
