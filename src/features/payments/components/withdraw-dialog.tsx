"use client";

import { useActionState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { FormDialog } from "@/components/ui/form-dialog";
import { FormMessage } from "@/components/ui/form-message";
import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { requestPayoutAction } from "@/features/payments/actions";
import type { ActionState } from "@/lib/action-state";
import { formatPHP } from "@/lib/money";

function WithdrawForm({
  available,
  arrives,
  onDone,
}: {
  available: number;
  arrives: string;
  onDone: () => void;
}) {
  const [state, action] = useActionState<ActionState, FormData>(requestPayoutAction, {});
  useEffect(() => {
    if (state.ok) onDone();
  }, [state.ok, onDone]);
  return (
    <form action={action} className="flex flex-col gap-4">
      <p className="rounded-control bg-amber-chip text-amber-chip-ink px-4 py-3 text-sm font-medium">
        Demo only. This records a request but no real money moves yet.
      </p>
      <FormMessage state={state} />
      <Field
        label="Amount to withdraw (₱)"
        hint={`Available ${formatPHP(available)}`}
        error={state.fieldErrors?.amount?.[0]}
      >
        <Input
          name="amount"
          inputMode="decimal"
          required
          placeholder="0.00"
          defaultValue={state.values?.amount}
        />
      </Field>
      <Field
        label="To"
        hint="A name and the last 4 digits only. Never type a full account number."
        error={state.fieldErrors?.destination?.[0]}
      >
        <Input
          name="destination"
          required
          maxLength={60}
          placeholder="BDO ••1920"
          defaultValue={state.values?.destination}
        />
      </Field>
      <dl className="rounded-control bg-canvas grid grid-cols-2 gap-2 p-4 text-sm">
        <dt className="text-muted">From</dt>
        <dd className="text-right font-medium">Clinic balance</dd>
        <dt className="text-muted">Fee</dt>
        <dd className="tabular text-right font-medium">₱0.00</dd>
        <dt className="text-muted">Arrives</dt>
        <dd className="text-right font-medium">{arrives}</dd>
      </dl>
      <div className="flex justify-end gap-3">
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <SubmitButton pendingLabel="Recording…">Withdraw</SubmitButton>
      </div>
    </form>
  );
}

export function WithdrawDialog({
  available,
  arrives,
  tone = "mint",
}: {
  available: number;
  arrives: string;
  tone?: "mint" | "ghost";
}) {
  return (
    <FormDialog title="Withdraw" trigger={<Button variant={tone}>Withdraw</Button>}>
      {(close) => <WithdrawForm available={available} arrives={arrives} onDone={close} />}
    </FormDialog>
  );
}
