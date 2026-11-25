"use client";

import { useActionState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { FormDialog } from "@/components/ui/form-dialog";
import { FormMessage } from "@/components/ui/form-message";
import { Input, Textarea } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import {
  addPrescriptionAction,
  addVisitAction,
  stopPrescriptionAction,
} from "@/features/patients/actions";
import type { ActionState } from "@/lib/action-state";

function VisitForm({ patientId, onDone }: { patientId: string; onDone: () => void }) {
  const [state, action] = useActionState<ActionState, FormData>(addVisitAction, {});
  useEffect(() => {
    if (state.ok) onDone();
  }, [state.ok, onDone]);
  const err = (k: string) => state.fieldErrors?.[k]?.[0];
  const val = (k: string) => state.values?.[k] ?? "";
  return (
    <form action={action} className="flex flex-col gap-4">
      <FormMessage state={state} />
      <input type="hidden" name="patientId" value={patientId} />
      <Field label="Reason or title" error={err("title")}>
        <Input
          name="title"
          maxLength={120}
          placeholder="e.g. Follow-up consultation"
          defaultValue={val("title")}
        />
      </Field>
      <fieldset className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <legend className="mb-2 text-sm font-semibold">Vitals (all optional)</legend>
        <Field label="BP systolic" error={err("bp_systolic")}>
          <Input
            name="bp_systolic"
            inputMode="numeric"
            placeholder="118"
            defaultValue={val("bp_systolic")}
          />
        </Field>
        <Field label="BP diastolic" error={err("bp_diastolic")}>
          <Input
            name="bp_diastolic"
            inputMode="numeric"
            placeholder="76"
            defaultValue={val("bp_diastolic")}
          />
        </Field>
        <Field label="Heart rate (bpm)" error={err("heart_rate")}>
          <Input
            name="heart_rate"
            inputMode="numeric"
            placeholder="72"
            defaultValue={val("heart_rate")}
          />
        </Field>
        <Field label="Weight (kg)" error={err("weight_kg")}>
          <Input
            name="weight_kg"
            inputMode="decimal"
            placeholder="58.4"
            defaultValue={val("weight_kg")}
          />
        </Field>
        <Field label="Temp (°C)" error={err("temp_c")}>
          <Input
            name="temp_c"
            inputMode="decimal"
            placeholder="36.6"
            defaultValue={val("temp_c")}
          />
        </Field>
      </fieldset>
      <Field label="Notes" error={err("notes")}>
        <Textarea name="notes" maxLength={4000} defaultValue={val("notes")} />
      </Field>
      <div className="flex justify-end">
        <SubmitButton pendingLabel="Saving…">Save visit</SubmitButton>
      </div>
    </form>
  );
}

export function StartConsultationDialog({ patientId }: { patientId: string }) {
  return (
    <FormDialog
      title="Start consultation"
      description="Record vitals and notes for this visit."
      trigger={<Button>Start consultation</Button>}
    >
      {(close) => <VisitForm patientId={patientId} onDone={close} />}
    </FormDialog>
  );
}

function PrescriptionForm({ patientId, onDone }: { patientId: string; onDone: () => void }) {
  const [state, action] = useActionState<ActionState, FormData>(addPrescriptionAction, {});
  useEffect(() => {
    if (state.ok) onDone();
  }, [state.ok, onDone]);
  return (
    <form action={action} className="flex flex-col gap-4">
      <FormMessage state={state} />
      <input type="hidden" name="patientId" value={patientId} />
      <Field label="Medication" error={state.fieldErrors?.medication?.[0]}>
        <Input name="medication" required maxLength={120} defaultValue={state.values?.medication} />
      </Field>
      <Field
        label="Dosage"
        hint="For example: 50 mg · daily"
        error={state.fieldErrors?.dosage?.[0]}
      >
        <Input name="dosage" maxLength={120} defaultValue={state.values?.dosage} />
      </Field>
      <div className="flex justify-end">
        <SubmitButton pendingLabel="Saving…">Add medication</SubmitButton>
      </div>
    </form>
  );
}

export function AddMedicationDialog({ patientId }: { patientId: string }) {
  return (
    <FormDialog title="Add medication" trigger={<Button variant="ghost">Add</Button>}>
      {(close) => <PrescriptionForm patientId={patientId} onDone={close} />}
    </FormDialog>
  );
}

export function StopMedicationButton({
  prescriptionId,
  patientId,
  name,
}: {
  prescriptionId: string;
  patientId: string;
  name: string;
}) {
  const [state, action] = useActionState<ActionState, FormData>(stopPrescriptionAction, {});
  return (
    <form action={action}>
      <input type="hidden" name="prescriptionId" value={prescriptionId} />
      <input type="hidden" name="patientId" value={patientId} />
      <SubmitButton variant="ghost" pendingLabel="Stopping…" aria-label={`Stop ${name}`}>
        Stop
      </SubmitButton>
      {state.message && !state.ok ? (
        <span role="alert" className="text-danger-chip-ink text-sm">
          {state.message}
        </span>
      ) : null}
    </form>
  );
}
