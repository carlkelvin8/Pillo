"use client";

import { Plus } from "lucide-react";
import { useActionState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { FormDialog } from "@/components/ui/form-dialog";
import { FormMessage } from "@/components/ui/form-message";
import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { addDoctorAction, setDoctorActiveAction } from "@/features/branches/actions";
import type { ActionState } from "@/lib/action-state";

function DoctorForm({
  canLinkSelf,
  defaultName,
  onDone,
}: {
  canLinkSelf: boolean;
  defaultName: string;
  onDone: () => void;
}) {
  const [state, action] = useActionState<ActionState, FormData>(addDoctorAction, {});
  useEffect(() => {
    if (state.ok) onDone();
  }, [state.ok, onDone]);
  return (
    <form action={action} className="flex flex-col gap-4">
      <FormMessage state={state} />
      <Field label="Name" error={state.fieldErrors?.displayName?.[0]}>
        <Input
          name="displayName"
          required
          maxLength={120}
          defaultValue={state.values?.displayName ?? ""}
          placeholder="e.g. Dr. Reyes"
        />
      </Field>
      <Field label="Specialty" error={state.fieldErrors?.specialty?.[0]}>
        <Input
          name="specialty"
          maxLength={120}
          defaultValue={state.values?.specialty ?? ""}
          placeholder="e.g. General dentistry"
        />
      </Field>
      {canLinkSelf ? (
        <label className="flex min-h-11 items-start gap-3 text-sm">
          <input type="checkbox" name="linkSelf" className="accent-ink mt-1 size-5 shrink-0" />
          <span>This is me ({defaultName}). I see patients myself.</span>
        </label>
      ) : null}
      <div className="flex justify-end">
        <SubmitButton pendingLabel="Adding…">Add doctor</SubmitButton>
      </div>
    </form>
  );
}

export function AddDoctorDialog({
  canLinkSelf,
  defaultName,
}: {
  canLinkSelf: boolean;
  defaultName: string;
}) {
  return (
    <FormDialog
      title="Add a doctor"
      description="People who can be booked. Doctors you invite with the Doctor role appear here automatically."
      trigger={
        <Button variant="ghost">
          <Plus aria-hidden="true" /> Add doctor
        </Button>
      }
    >
      {(close) => <DoctorForm canLinkSelf={canLinkSelf} defaultName={defaultName} onDone={close} />}
    </FormDialog>
  );
}

export function DoctorActiveButton({
  doctorId,
  active,
  name,
}: {
  doctorId: string;
  active: boolean;
  name: string;
}) {
  const [state, action] = useActionState<ActionState, FormData>(setDoctorActiveAction, {});
  return (
    <form action={action}>
      <input type="hidden" name="doctorId" value={doctorId} />
      <input type="hidden" name="active" value={active ? "false" : "true"} />
      <SubmitButton
        variant="ghost"
        pendingLabel="Saving…"
        aria-label={`${active ? "Deactivate" : "Activate"} ${name}`}
      >
        {active ? "Deactivate" : "Activate"}
      </SubmitButton>
      {state.message && !state.ok ? (
        <span role="alert" className="text-danger-chip-ink text-sm">
          {state.message}
        </span>
      ) : null}
    </form>
  );
}
