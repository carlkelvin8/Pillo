"use client";

import { Plus } from "lucide-react";
import { useActionState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { FormDialog } from "@/components/ui/form-dialog";
import { FormMessage } from "@/components/ui/form-message";
import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import {
  createBranchAction,
  saveHoursAction,
  updateBranchAction,
} from "@/features/branches/actions";
import { WEEKDAYS } from "@/features/branches/schemas";
import type { ActionState } from "@/lib/action-state";

type BranchFields = { id?: string; name: string; address: string | null; phone: string | null };

export function BranchDetailsForm({
  branch,
  onDone,
}: {
  branch?: BranchFields;
  onDone?: () => void;
}) {
  const [state, action] = useActionState<ActionState, FormData>(
    branch?.id ? updateBranchAction : createBranchAction,
    {},
  );
  useEffect(() => {
    if (state.ok) onDone?.();
  }, [state.ok, onDone]);
  const v = (k: "name" | "address" | "phone", fallback: string | null | undefined) =>
    state.values?.[k] ?? fallback ?? "";
  return (
    <form action={action} className="flex flex-col gap-4">
      <FormMessage state={state} />
      {branch?.id ? <input type="hidden" name="branchId" value={branch.id} /> : null}
      <Field label="Branch name" error={state.fieldErrors?.name?.[0]}>
        <Input name="name" required maxLength={120} defaultValue={v("name", branch?.name)} />
      </Field>
      <Field label="Address" error={state.fieldErrors?.address?.[0]}>
        <Input name="address" maxLength={300} defaultValue={v("address", branch?.address)} />
      </Field>
      <Field label="Phone" error={state.fieldErrors?.phone?.[0]}>
        <Input name="phone" type="tel" maxLength={40} defaultValue={v("phone", branch?.phone)} />
      </Field>
      <div>
        <SubmitButton pendingLabel="Saving…">
          {branch?.id ? "Save branch" : "Add branch"}
        </SubmitButton>
      </div>
    </form>
  );
}

export function AddBranchDialog() {
  return (
    <FormDialog
      title="Add a branch"
      trigger={
        <Button variant="ghost">
          <Plus aria-hidden="true" /> Add branch
        </Button>
      }
    >
      {(close) => <BranchDetailsForm onDone={close} />}
    </FormDialog>
  );
}

export type DayHours = { weekday: number; open: boolean; opens: string; closes: string };

/** Weekly opening hours for one branch. One window per day; unchecked days are closed. */
export function HoursForm({
  branchId,
  days,
  saved,
}: {
  branchId: string;
  days: DayHours[];
  saved: boolean;
}) {
  const [state, action] = useActionState<ActionState, FormData>(saveHoursAction, {});
  const byDay = new Map(days.map((d) => [d.weekday, d]));
  return (
    <form action={action} className="flex flex-col gap-3">
      <FormMessage state={state} />
      {!saved ? (
        <p className="text-muted text-sm">
          These are suggested hours. Nothing is saved until you press Save hours.
        </p>
      ) : null}
      <ul className="divide-line flex flex-col divide-y">
        {WEEKDAYS.map(({ value, label }) => {
          const d = byDay.get(value) ?? {
            weekday: value,
            open: false,
            opens: "09:00",
            closes: "17:00",
          };
          return (
            <li key={value} className="flex flex-wrap items-center gap-x-6 gap-y-2 py-2">
              <label className="flex min-h-11 w-36 items-center gap-3 text-sm font-medium">
                <input
                  type="checkbox"
                  name={`open_${value}`}
                  defaultChecked={d.open}
                  className="accent-ink size-5"
                />
                {label}
              </label>
              <div className="flex items-center gap-2 text-sm">
                <label className="sr-only" htmlFor={`opens_${branchId}_${value}`}>
                  {label} opens
                </label>
                <Input
                  id={`opens_${branchId}_${value}`}
                  name={`opens_${value}`}
                  type="time"
                  defaultValue={d.opens}
                  className="w-32"
                />
                <span aria-hidden="true">to</span>
                <label className="sr-only" htmlFor={`closes_${branchId}_${value}`}>
                  {label} closes
                </label>
                <Input
                  id={`closes_${branchId}_${value}`}
                  name={`closes_${value}`}
                  type="time"
                  defaultValue={d.closes}
                  className="w-32"
                />
              </div>
            </li>
          );
        })}
      </ul>
      <input type="hidden" name="branchId" value={branchId} />
      <div>
        <SubmitButton pendingLabel="Saving…">Save hours</SubmitButton>
      </div>
    </form>
  );
}
