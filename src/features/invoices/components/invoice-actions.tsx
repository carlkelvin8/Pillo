"use client";

import { Check, Copy } from "lucide-react";
import { useActionState, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { FormDialog } from "@/components/ui/form-dialog";
import { FormMessage } from "@/components/ui/form-message";
import { Input, Select } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import {
  cancelPaymentLinkAction,
  recordPaymentAction,
  requestPaymentAction,
  sendInvoiceAction,
  voidInvoiceAction,
} from "@/features/invoices/actions";
import type { ActionState } from "@/lib/action-state";

function Simple({
  action,
  invoiceId,
  label,
  pending,
  variant = "primary",
}: {
  action: (p: ActionState, f: FormData) => Promise<ActionState>;
  invoiceId: string;
  label: string;
  pending: string;
  variant?: "primary" | "ghost" | "mint" | "danger";
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(action, {});
  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="invoiceId" value={invoiceId} />
      <SubmitButton variant={variant} pendingLabel={pending}>
        {label}
      </SubmitButton>
      {state.message && !state.ok ? <FormMessage state={state} /> : null}
    </form>
  );
}

export const SendInvoiceButton = (p: { invoiceId: string }) => (
  <Simple action={sendInvoiceAction} label="Mark as sent" pending="Sending…" {...p} />
);
export const VoidInvoiceButton = (p: { invoiceId: string }) => (
  <Simple
    action={voidInvoiceAction}
    label="Void invoice"
    pending="Voiding…"
    variant="danger"
    {...p}
  />
);

export function RequestPaymentButton({ invoiceId }: { invoiceId: string }) {
  const [state, action] = useActionState<ActionState, FormData>(requestPaymentAction, {});
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="invoiceId" value={invoiceId} />
      <SubmitButton variant="mint" pendingLabel="Creating link…">
        Request payment
      </SubmitButton>
      <p className="text-muted text-xs">
        Creates a GCash, Maya and card payment link for what is still due.
      </p>
      <FormMessage state={state} />
    </form>
  );
}

export function CopyLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center gap-2">
      <input
        readOnly
        value={url}
        aria-label="Payment link"
        onFocus={(e) => e.currentTarget.select()}
        className="rounded-control border-line-strong bg-canvas min-h-11 min-w-0 flex-1 border px-3 text-sm"
      />
      <Button
        type="button"
        variant="ghost"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(url);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          } catch {
            /* clipboard unavailable: the field above can be copied by hand */
          }
        }}
      >
        {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}{" "}
        {copied ? "Copied" : "Copy"}
      </Button>
    </div>
  );
}

export function CancelLinkButton({
  paymentId,
  invoiceId,
}: {
  paymentId: string;
  invoiceId: string;
}) {
  const [state, action] = useActionState<ActionState, FormData>(cancelPaymentLinkAction, {});
  return (
    <form action={action}>
      <input type="hidden" name="paymentId" value={paymentId} />
      <input type="hidden" name="invoiceId" value={invoiceId} />
      <SubmitButton variant="ghost" pendingLabel="Cancelling…">
        Cancel link
      </SubmitButton>
      {state.message && !state.ok ? <FormMessage state={state} /> : null}
    </form>
  );
}

function RecordForm({
  invoiceId,
  dueLabel,
  onDone,
}: {
  invoiceId: string;
  dueLabel: string;
  onDone: () => void;
}) {
  const [state, action] = useActionState<ActionState, FormData>(recordPaymentAction, {});
  useEffect(() => {
    if (state.ok) onDone();
  }, [state.ok, onDone]);
  return (
    <form action={action} className="flex flex-col gap-4">
      <FormMessage state={state} />
      <input type="hidden" name="invoiceId" value={invoiceId} />
      <Field label="Method">
        <Select name="method" defaultValue="cash">
          <option value="cash">Cash</option>
          <option value="bank">Bank transfer</option>
        </Select>
      </Field>
      <Field
        label="Amount received (₱)"
        hint={`Still due: ${dueLabel}`}
        error={state.fieldErrors?.amount?.[0]}
      >
        <Input
          name="amount"
          inputMode="decimal"
          required
          defaultValue={state.values?.amount}
          placeholder="0.00"
        />
      </Field>
      <Field label="Reference (optional)" error={state.fieldErrors?.reference?.[0]}>
        <Input
          name="reference"
          maxLength={80}
          defaultValue={state.values?.reference}
          placeholder="Receipt or transfer number"
        />
      </Field>
      <div className="flex justify-end">
        <SubmitButton pendingLabel="Recording…">Record payment</SubmitButton>
      </div>
    </form>
  );
}

export function RecordPaymentDialog({
  invoiceId,
  dueLabel,
}: {
  invoiceId: string;
  dueLabel: string;
}) {
  return (
    <FormDialog
      title="Record a payment"
      description="For cash or bank transfers received outside the payment link."
      trigger={<Button variant="ghost">Record cash or bank payment</Button>}
    >
      {(close) => <RecordForm invoiceId={invoiceId} dueLabel={dueLabel} onDone={close} />}
    </FormDialog>
  );
}
