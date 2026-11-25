"use client";

import { useEffect, useState, useTransition } from "react";
import { getSlotsAction } from "@/features/scheduling/actions";
import { formatTime, formatWeekday } from "@/lib/datetime";
import { cn } from "@/lib/utils";

type Props = {
  doctorId: string;
  branchId: string;
  durationMin: number;
  /** Clinic-local dates ("YYYY-MM-DD") the branch is open, soonest first. */
  openDates: string[];
  tz: string;
  excludeAppointmentId?: string;
  /** Name of the hidden input carrying the chosen start (UTC ISO). */
  name?: string;
  error?: string;
};

const chip =
  "inline-flex min-h-11 min-w-11 items-center justify-center rounded-control border px-3 text-sm font-medium transition-colors";

/** Date chips, then the open times for that date. Submits the chosen start in a hidden input. */
export function SlotPicker({
  doctorId,
  branchId,
  durationMin,
  openDates,
  tz,
  excludeAppointmentId,
  name = "startsAt",
  error,
}: Props) {
  const [date, setDate] = useState(openDates[0] ?? "");
  const [slots, setSlots] = useState<string[]>([]);
  const [selected, setSelected] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!date || !doctorId || !branchId) return;
    let cancelled = false;
    setSelected("");
    setLoaded(false);
    startTransition(async () => {
      const result = await getSlotsAction({
        doctorId,
        branchId,
        date,
        durationMin,
        excludeAppointmentId,
      });
      if (cancelled) return;
      setSlots(result.map((s) => s.startsAt));
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [date, doctorId, branchId, durationMin, excludeAppointmentId]);

  if (openDates.length === 0) {
    return (
      <p className="rounded-control bg-amber-chip text-amber-chip-ink p-3 text-sm">
        No opening hours are set for this branch yet.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <input type="hidden" name={name} value={selected} />
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-semibold">Date</legend>
        <div className="flex flex-wrap gap-2">
          {openDates.map((d) => (
            <button
              key={d}
              type="button"
              aria-pressed={d === date}
              onClick={() => setDate(d)}
              className={cn(
                chip,
                "flex-col py-1.5 leading-tight",
                d === date
                  ? "border-ink bg-ink text-surface"
                  : "border-line-strong bg-surface hover:bg-subtle",
              )}
            >
              <span className="text-xs">{formatWeekday(d)}</span>
              <span className="tabular text-base font-semibold">{Number(d.slice(8))}</span>
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-semibold">Time</legend>
        <div aria-live="polite">
          {pending || !loaded ? <p className="text-muted text-sm">Finding open times…</p> : null}
          {loaded && !pending && slots.length === 0 ? (
            <p className="text-muted text-sm">
              No open times on this day. Try another date or doctor.
            </p>
          ) : null}
        </div>
        {slots.length > 0 && !pending ? (
          <div className="flex flex-wrap gap-2">
            {slots.map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={s === selected}
                onClick={() => setSelected(s)}
                className={cn(
                  chip,
                  "tabular",
                  s === selected
                    ? "border-mint-ink bg-mint text-mint-ink"
                    : "border-line-strong bg-surface hover:bg-subtle",
                )}
              >
                {formatTime(s, tz)}
              </button>
            ))}
          </div>
        ) : null}
        {error ? <p className="text-danger-chip-ink text-sm">{error}</p> : null}
      </fieldset>
    </div>
  );
}
