import { cn } from "@/lib/utils";

export const ONBOARDING_STEPS = ["Clinic", "Team", "Dr. Pill", "Payments"] as const;

/** Progress through onboarding. The current step is marked for assistive tech. */
export function StepIndicator({ current }: { current: 1 | 2 | 3 | 4 }) {
  return (
    <ol aria-label="Setup progress" className="flex flex-wrap gap-2">
      {ONBOARDING_STEPS.map((label, i) => {
        const n = i + 1;
        const state = n < current ? "done" : n === current ? "current" : "todo";
        return (
          <li
            key={label}
            aria-current={state === "current" ? "step" : undefined}
            className={cn(
              "inline-flex min-h-9 items-center gap-2 rounded-full px-4 text-sm font-medium",
              state === "current" && "bg-ink text-surface",
              state === "done" && "bg-mint text-mint-ink",
              state === "todo" && "border-line-strong text-muted border",
            )}
          >
            <span aria-hidden="true" className="tabular">
              {n}
            </span>
            {label}
            {state === "done" ? <span className="sr-only"> (done)</span> : null}
          </li>
        );
      })}
    </ol>
  );
}
