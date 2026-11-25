"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Field } from "@/components/ui/field";
import { FormDialog } from "@/components/ui/form-dialog";
import { FormMessage } from "@/components/ui/form-message";
import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import {
  rescheduleAppointmentAction,
  setAppointmentStatusAction,
} from "@/features/scheduling/actions";
import type { AppointmentSource, AppointmentStatus } from "@/features/scheduling/schemas";
import { SOURCE_LABEL, STATUS_LABEL, STATUS_TONE } from "@/features/scheduling/status";
import type { ActionState } from "@/lib/action-state";
import { cn } from "@/lib/utils";
import { SlotPicker } from "./slot-picker";

export type BlockVariant = "default" | "ai" | "progress" | "done" | "noshow";

export type BlockData = {
  id: string;
  patientId: string;
  patientName: string;
  doctorId: string;
  doctorName: string;
  branchId: string;
  branchName: string;
  dateLabel: string;
  timeLabel: string;
  durationMin: number;
  reason: string | null;
  status: AppointmentStatus;
  source: AppointmentSource;
  variant: BlockVariant;
  top: number;
  height: number;
  lane: number;
  lanes: number;
  canEdit: boolean;
  openDates: string[];
  tz: string;
};

const VARIANT: Record<BlockVariant, string> = {
  default: "border-line bg-canvas text-ink",
  ai: "border-mint bg-mint text-mint-ink",
  progress: "border-ink bg-ink text-surface",
  done: "border-line bg-neutral-chip text-muted",
  noshow: "border-danger-chip bg-danger-chip text-danger-chip-ink",
};

function Details({ block, onDone }: { block: BlockData; onDone: () => void }) {
  const [mode, setMode] = useState<"view" | "cancel" | "reschedule">("view");
  const [statusState, statusAction] = useActionState<ActionState, FormData>(
    setAppointmentStatusAction,
    {},
  );
  const [moveState, moveAction] = useActionState<ActionState, FormData>(
    rescheduleAppointmentAction,
    {},
  );
  useEffect(() => {
    if (statusState.ok || moveState.ok) onDone();
  }, [statusState.ok, moveState.ok, onDone]);

  const open = block.status === "scheduled" || block.status === "confirmed";
  return (
    <div className="flex flex-col gap-5">
      <dl className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <dt className="text-muted">When</dt>
          <dd className="font-medium">
            {block.dateLabel}
            <br />
            {block.timeLabel}
          </dd>
        </div>
        <div>
          <dt className="text-muted">Doctor</dt>
          <dd className="font-medium">{block.doctorName}</dd>
        </div>
        <div>
          <dt className="text-muted">Branch</dt>
          <dd className="font-medium">{block.branchName}</dd>
        </div>
        <div>
          <dt className="text-muted">Reason</dt>
          <dd className="font-medium">{block.reason ?? "—"}</dd>
        </div>
      </dl>
      <div className="flex flex-wrap items-center gap-2">
        <Chip tone={STATUS_TONE[block.status]}>{STATUS_LABEL[block.status]}</Chip>
        <Chip tone="neutral">{SOURCE_LABEL[block.source]}</Chip>
      </div>
      <Link
        href={`/patients/${block.patientId}`}
        className="inline-flex min-h-11 w-fit items-center text-sm font-medium underline underline-offset-4"
      >
        Open patient record
      </Link>

      {block.canEdit && open ? (
        <div className="border-line flex flex-col gap-4 border-t pt-5">
          <FormMessage state={statusState.message ? statusState : moveState} />

          {mode === "view" ? (
            <form action={statusAction} className="flex flex-wrap gap-2">
              <input type="hidden" name="appointmentId" value={block.id} />
              {block.status === "scheduled" ? (
                <SubmitButton name="status" value="confirmed" variant="mint" pendingLabel="Saving…">
                  Confirm
                </SubmitButton>
              ) : null}
              <SubmitButton name="status" value="completed" variant="ghost" pendingLabel="Saving…">
                Mark completed
              </SubmitButton>
              <SubmitButton name="status" value="no_show" variant="ghost" pendingLabel="Saving…">
                No-show
              </SubmitButton>
              <Button type="button" variant="ghost" onClick={() => setMode("reschedule")}>
                Reschedule
              </Button>
              <Button type="button" variant="danger" onClick={() => setMode("cancel")}>
                Cancel appointment
              </Button>
            </form>
          ) : null}

          {mode === "cancel" ? (
            <form action={statusAction} className="flex flex-col gap-3">
              <input type="hidden" name="appointmentId" value={block.id} />
              <input type="hidden" name="status" value="cancelled" />
              <Field label="Reason for cancelling (optional)">
                <Input name="cancelReason" maxLength={200} />
              </Field>
              <div className="flex gap-3">
                <SubmitButton variant="danger" pendingLabel="Cancelling…">
                  Cancel this appointment
                </SubmitButton>
                <Button type="button" variant="ghost" onClick={() => setMode("view")}>
                  Keep it
                </Button>
              </div>
            </form>
          ) : null}

          {mode === "reschedule" ? (
            <form action={moveAction} className="flex flex-col gap-4">
              <input type="hidden" name="appointmentId" value={block.id} />
              <SlotPicker
                doctorId={block.doctorId}
                branchId={block.branchId}
                durationMin={block.durationMin}
                openDates={block.openDates}
                tz={block.tz}
                excludeAppointmentId={block.id}
                error={moveState.fieldErrors?.startsAt?.[0]}
              />
              <div className="flex gap-3">
                <SubmitButton pendingLabel="Moving…">Move appointment</SubmitButton>
                <Button type="button" variant="ghost" onClick={() => setMode("view")}>
                  Back
                </Button>
              </div>
            </form>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** One appointment on the calendar. Opens a dialog with details and actions. */
export function AppointmentBlock({ block }: { block: BlockData }) {
  const { lane, lanes } = block;
  return (
    <FormDialog
      title={block.patientName}
      description={block.reason ?? "Appointment"}
      trigger={
        <button
          type="button"
          style={{
            top: block.top,
            height: block.height,
            left: `calc(${(lane / lanes) * 100}% + 6px)`,
            width: `calc(${100 / lanes}% - 12px)`,
          }}
          className={cn(
            "rounded-control absolute flex overflow-hidden border px-2.5 text-left leading-tight",
            // Short (30 min) blocks fit on one line; longer ones stack name over reason like the design.
            block.height < 44 ? "items-center gap-2 py-0.5" : "flex-col py-1.5",
            "focus-visible:outline-ink focus-visible:outline-2 focus-visible:outline-offset-2",
            VARIANT[block.variant],
          )}
        >
          <span className="truncate text-[13px] font-semibold">{block.patientName}</span>
          <span className={cn("truncate text-[11px] opacity-80", block.height < 44 && "hidden")}>
            {block.source === "ai" ? "Booked by Dr. Pill" : (block.reason ?? block.doctorName)}
          </span>
        </button>
      }
    >
      {(close) => <Details block={block} onDone={close} />}
    </FormDialog>
  );
}
