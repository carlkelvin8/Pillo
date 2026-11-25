import type { ActionState } from "@/lib/action-state";
import { cn } from "@/lib/utils";

/** Result banner for a Server Action. Announced to screen readers. */
export function FormMessage({ state, className }: { state: ActionState; className?: string }) {
  if (!state.message) return null;
  return (
    <p
      role={state.ok ? "status" : "alert"}
      className={cn(
        "rounded-control px-4 py-3 text-sm font-medium",
        state.ok ? "bg-mint text-mint-ink" : "bg-danger-chip text-danger-chip-ink",
        className,
      )}
    >
      {state.message}
    </p>
  );
}
