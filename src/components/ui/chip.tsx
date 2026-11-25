import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

const chipVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold whitespace-nowrap",
  {
    variants: {
      tone: {
        success: "bg-mint text-mint-ink",
        pending: "bg-amber-chip text-amber-chip-ink",
        danger: "bg-danger-chip text-danger-chip-ink",
        neutral: "bg-neutral-chip text-ink-2",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

export type ChipProps = ComponentProps<"span"> & VariantProps<typeof chipVariants>;

export function Chip({ className, tone, ...props }: ChipProps) {
  return <span className={cn(chipVariants({ tone }), className)} {...props} />;
}

/** Invoice / payment status → chip tone, so every screen agrees. */
export const statusTone = {
  paid: "success",
  succeeded: "success",
  confirmed: "success",
  pending: "pending",
  draft: "neutral",
  sent: "pending",
  overdue: "danger",
  failed: "danger",
  cancelled: "neutral",
} as const satisfies Record<string, NonNullable<ChipProps["tone"]>>;
