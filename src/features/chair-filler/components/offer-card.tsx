"use client";

import { useActionState } from "react";
import { FormMessage } from "@/components/ui/form-message";
import { SubmitButton } from "@/components/ui/submit-button";
import { approveOfferAction, skipOfferAction } from "@/features/chair-filler/actions";
import type { ActionState } from "@/lib/action-state";

function Skip({ offerId }: { offerId: string }) {
  const [state, action] = useActionState<ActionState, FormData>(skipOfferAction, {});
  return (
    <form action={action}>
      <input type="hidden" name="offerId" value={offerId} />
      <SubmitButton variant="ghost" pendingLabel="Skipping…">
        Skip
      </SubmitButton>
      {state.message && !state.ok ? <FormMessage state={state} /> : null}
    </form>
  );
}

/** Approve (or re-make the link) and show the message for staff to copy and send. */
export function OfferActions({ offerId, sent }: { offerId: string; sent: boolean }) {
  const [state, action] = useActionState<ActionState, FormData>(approveOfferAction, {});
  const text = state.data?.text;
  return (
    <div className="flex w-full flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <form action={action}>
          <input type="hidden" name="offerId" value={offerId} />
          <SubmitButton variant="mint" pendingLabel="Working…">
            {sent ? "Make a new link" : "Approve and get message"}
          </SubmitButton>
        </form>
        <Skip offerId={offerId} />
      </div>
      {state.message && !state.ok ? <FormMessage state={state} /> : null}
      {text ? (
        <div className="bg-subtle rounded-control flex flex-col gap-2 p-4">
          <label htmlFor={`offer-text-${offerId}`} className="text-sm font-semibold">
            Message to send (the link is shown only now)
          </label>
          <textarea
            id={`offer-text-${offerId}`}
            readOnly
            rows={4}
            value={text}
            onFocus={(e) => e.currentTarget.select()}
            className="rounded-control border-line-strong bg-surface w-full border px-3 py-2 text-sm"
          />
        </div>
      ) : null}
    </div>
  );
}
