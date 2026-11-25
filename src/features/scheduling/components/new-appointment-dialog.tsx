"use client";

import Link from "next/link";
import { CalendarPlus } from "lucide-react";
import { useActionState, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { FormDialog } from "@/components/ui/form-dialog";
import { FormMessage } from "@/components/ui/form-message";
import { Input, Select } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { Switch } from "@/components/ui/switch";
import { PatientPicker } from "@/features/patients/components/patient-picker";
import { createAppointmentAction } from "@/features/scheduling/actions";
import { DURATIONS } from "@/features/scheduling/schemas";
import type { ActionState } from "@/lib/action-state";
import { cn } from "@/lib/utils";
import { SlotPicker } from "./slot-picker";

export type DoctorOption = { id: string; name: string; specialty: string | null };
export type BranchOption = { id: string; name: string };

type Props = {
  doctors: DoctorOption[];
  branches: BranchOption[];
  defaultBranchId: string;
  openDatesByBranch: Record<string, string[]>;
  tz: string;
  canSetup: boolean;
};

function NewAppointmentForm({
  doctors,
  branches,
  defaultBranchId,
  openDatesByBranch,
  tz,
  canSetup,
  onDone,
}: Props & { onDone: () => void }) {
  const [state, action] = useActionState<ActionState, FormData>(createAppointmentAction, {});
  const [doctorId, setDoctorId] = useState(doctors[0]?.id ?? "");
  const [branchId, setBranchId] = useState(defaultBranchId);
  const [duration, setDuration] = useState(30);
  useEffect(() => {
    if (state.ok) onDone();
  }, [state.ok, onDone]);

  if (doctors.length === 0) {
    return (
      <p className="text-muted">
        There are no doctors to book yet.{" "}
        {canSetup ? (
          <Link className="text-ink font-medium underline" href="/settings/doctors">
            Add a doctor in Settings
          </Link>
        ) : (
          "Ask the clinic owner to add a doctor."
        )}
      </p>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-5">
      <FormMessage state={state} />
      <PatientPicker error={state.fieldErrors?.patientId?.[0]} />

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-semibold">Doctor</legend>
        <div className="flex flex-wrap gap-2">
          {doctors.map((d) => (
            <label key={d.id} className="relative">
              <input
                type="radio"
                name="doctorId"
                value={d.id}
                checked={doctorId === d.id}
                onChange={() => setDoctorId(d.id)}
                className="peer absolute inset-0 size-full cursor-pointer opacity-0"
              />
              <span
                className={cn(
                  "rounded-control border-line-strong bg-surface inline-flex min-h-11 flex-col justify-center border px-4 py-1 text-sm",
                  "peer-checked:border-ink peer-checked:bg-ink peer-checked:text-surface",
                  "peer-focus-visible:outline-ink peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2",
                )}
              >
                <span className="font-medium">{d.name}</span>
                {d.specialty ? <span className="text-xs opacity-70">{d.specialty}</span> : null}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        {branches.length > 1 ? (
          <Field label="Branch">
            <Select name="branchId" value={branchId} onChange={(e) => setBranchId(e.target.value)}>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </Select>
          </Field>
        ) : (
          <input type="hidden" name="branchId" value={branchId} />
        )}
        <Field label="Length">
          <Select
            name="durationMin"
            value={duration}
            onChange={(e) => setDuration(Number(e.target.value))}
          >
            {DURATIONS.map((m) => (
              <option key={m} value={m}>
                {m} minutes
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <SlotPicker
        key={`${branchId}`}
        doctorId={doctorId}
        branchId={branchId}
        durationMin={duration}
        openDates={openDatesByBranch[branchId] ?? []}
        tz={tz}
        error={state.fieldErrors?.startsAt?.[0]}
      />

      <Field label="Reason" error={state.fieldErrors?.reason?.[0]}>
        <Input
          name="reason"
          maxLength={200}
          placeholder="e.g. General check-up"
          defaultValue={state.values?.reason}
        />
      </Field>

      <label className="rounded-control bg-canvas flex min-h-11 items-center justify-between gap-4 px-4 py-2">
        <span className="flex flex-col">
          <span className="text-sm font-semibold">Send a reminder</span>
          <span className="text-muted text-xs">24 hours before the visit</span>
        </span>
        <Switch name="sendReminder" defaultChecked aria-label="Send a reminder" />
      </label>

      <div className="flex justify-end gap-3">
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <SubmitButton pendingLabel="Booking…">Book appointment</SubmitButton>
      </div>
    </form>
  );
}

export function NewAppointmentDialog(props: Props) {
  return (
    <FormDialog
      title="New appointment"
      className="max-w-xl"
      trigger={
        <Button>
          <CalendarPlus aria-hidden="true" /> New appointment
        </Button>
      }
    >
      {(close) => <NewAppointmentForm {...props} onDone={close} />}
    </FormDialog>
  );
}
