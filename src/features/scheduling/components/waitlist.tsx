"use client";

import { useActionState, useEffect } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Field } from "@/components/ui/field";
import { FormDialog } from "@/components/ui/form-dialog";
import { FormMessage } from "@/components/ui/form-message";
import { Input, Select } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { Switch } from "@/components/ui/switch";
import { PatientPicker } from "@/features/patients/components/patient-picker";
import { addWaitlistAction, removeWaitlistAction } from "@/features/scheduling/actions";
import type { ActionState } from "@/lib/action-state";
import type { DoctorOption } from "./new-appointment-dialog";

const DAYS = [
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
] as const;

function WaitlistForm({ doctors, onDone }: { doctors: DoctorOption[]; onDone: () => void }) {
  const [state, action] = useActionState<ActionState, FormData>(addWaitlistAction, {});
  useEffect(() => {
    if (state.ok) onDone();
  }, [state.ok, onDone]);
  return (
    <form action={action} className="flex flex-col gap-4">
      <FormMessage state={state} />
      <PatientPicker error={state.fieldErrors?.patientId?.[0]} />
      <Field label="What for?" error={state.fieldErrors?.reason?.[0]}>
        <Input
          name="reason"
          maxLength={200}
          placeholder="e.g. Cleaning"
          defaultValue={state.values?.reason}
        />
      </Field>
      <Field label="Preferred doctor">
        <Select name="doctorId" defaultValue="">
          <option value="">Any doctor</option>
          {doctors.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </Select>
      </Field>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-semibold">Preferred days (optional)</legend>
        <div className="flex flex-wrap gap-2">
          {DAYS.map((d) => (
            <label key={d.value} className="relative">
              <input
                type="checkbox"
                name="weekdays"
                value={d.value}
                className="peer absolute inset-0 size-full cursor-pointer opacity-0"
              />
              <span className="rounded-control border-line-strong bg-surface peer-checked:border-ink peer-checked:bg-ink peer-checked:text-surface peer-focus-visible:outline-ink inline-flex min-h-11 min-w-14 items-center justify-center border px-3 text-sm font-medium peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2">
                {d.label}
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <label className="rounded-control bg-canvas flex min-h-11 items-center justify-between gap-4 px-4 py-2">
        <span className="flex flex-col">
          <span className="text-sm font-semibold">OK to message when a slot opens</span>
          <span className="text-muted text-xs">Only with the patient&apos;s agreement</span>
        </span>
        <Switch name="outreachOk" aria-label="OK to message when a slot opens" />
      </label>
      <div className="flex justify-end">
        <SubmitButton pendingLabel="Adding…">Add to waitlist</SubmitButton>
      </div>
    </form>
  );
}

export function AddToWaitlistDialog({ doctors }: { doctors: DoctorOption[] }) {
  return (
    <FormDialog
      title="Add to waitlist"
      description="Patients who want an earlier slot."
      trigger={
        <Button variant="mint" className="min-h-10 px-3">
          <Plus aria-hidden="true" /> Add
        </Button>
      }
    >
      {(close) => <WaitlistForm doctors={doctors} onDone={close} />}
    </FormDialog>
  );
}

export function WaitlistRemoveButton({ entryId, name }: { entryId: string; name: string }) {
  const [state, action] = useActionState<ActionState, FormData>(removeWaitlistAction, {});
  return (
    <form action={action}>
      <input type="hidden" name="entryId" value={entryId} />
      <SubmitButton
        variant="ghost"
        className="min-h-9 px-3 text-xs"
        pendingLabel="Removing…"
        aria-label={`Remove ${name} from the waitlist`}
      >
        Remove
      </SubmitButton>
      {state.message && !state.ok ? (
        <span role="alert" className="text-danger-chip-ink text-sm">
          {state.message}
        </span>
      ) : null}
    </form>
  );
}

export function OutreachChip({ ok }: { ok: boolean }) {
  return ok ? (
    <Chip tone="success">OK to message</Chip>
  ) : (
    <Chip tone="neutral">No contact consent</Chip>
  );
}
