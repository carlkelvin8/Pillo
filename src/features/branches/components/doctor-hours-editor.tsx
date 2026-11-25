"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { removeDoctorHoursAction, saveDoctorHoursAction } from "@/features/branches/actions";
import { WEEKDAYS } from "@/features/branches/schemas";
import type { Branch } from "@/features/scheduling/schemas";
import type { ActionState } from "@/lib/action-state";

type Window = { id: string; branch_id: string; weekday: number; starts_at: string; ends_at: string };

function HoursForm({ doctorId, branches, value }: { doctorId: string; branches: Branch[]; value?: Window }) {
  const [state, action] = useActionState<ActionState, FormData>(saveDoctorHoursAction, {});
  return (
    <form action={action} className="grid gap-2 rounded-control border border-line p-3 sm:grid-cols-[1fr_1fr_1fr_1fr_auto] sm:items-end">
      <input type="hidden" name="doctorId" value={doctorId} />
      <input type="hidden" name="windowId" value={value?.id ?? ""} />
      <label className="text-muted flex flex-col gap-1 text-xs">Branch
        <Select name="branchId" defaultValue={value?.branch_id ?? branches[0]?.id} required>
          {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
        </Select>
      </label>
      <label className="text-muted flex flex-col gap-1 text-xs">Day
        <Select name="weekday" defaultValue={String(value?.weekday ?? 1)}>
          {WEEKDAYS.map((day) => <option key={day.value} value={day.value}>{day.label}</option>)}
        </Select>
      </label>
      <label className="text-muted flex flex-col gap-1 text-xs">Starts
        <input className="border-line-strong bg-surface min-h-11 rounded-control border px-3 text-ink" type="time" name="startsAt" defaultValue={value?.starts_at.slice(0, 5) ?? "09:00"} required />
      </label>
      <label className="text-muted flex flex-col gap-1 text-xs">Ends
        <input className="border-line-strong bg-surface min-h-11 rounded-control border px-3 text-ink" type="time" name="endsAt" defaultValue={value?.ends_at.slice(0, 5) ?? "17:00"} required />
      </label>
      <SubmitButton variant="ghost" pendingLabel="Saving…">{value ? "Save" : "Add"}</SubmitButton>
      {state.message ? <p className={state.ok ? "text-muted text-sm sm:col-span-5" : "text-danger-chip-ink text-sm sm:col-span-5"} role={state.ok ? "status" : "alert"}>{state.message}</p> : null}
    </form>
  );
}

export function DoctorHoursEditor({ doctorId, branches, windows }: { doctorId: string; branches: Branch[]; windows: Window[] }) {
  const [removeState, removeAction] = useActionState<ActionState, FormData>(removeDoctorHoursAction, {});
  return (
    <details className="w-full rounded-card border border-line p-4">
      <summary className="cursor-pointer font-medium">Weekly hours by branch</summary>
      <p className="text-muted mt-2 text-sm">With no saved windows, this doctor is available whenever the branch is open.</p>
      <div className="mt-4 flex flex-col gap-3">
        {windows.map((window) => (
          <div key={window.id} className="flex flex-col gap-2">
            <HoursForm doctorId={doctorId} branches={branches} value={window} />
            <form action={removeAction} className="flex justify-end">
              <input type="hidden" name="windowId" value={window.id} />
              <Button variant="ghost" type="submit">Remove window</Button>
            </form>
          </div>
        ))}
        {branches.length ? <HoursForm doctorId={doctorId} branches={branches} /> : <p className="text-muted text-sm">Add a branch before setting doctor hours.</p>}
        {removeState.message ? <p className={removeState.ok ? "text-muted text-sm" : "text-danger-chip-ink text-sm"} role={removeState.ok ? "status" : "alert"}>{removeState.message}</p> : null}
      </div>
    </details>
  );
}
