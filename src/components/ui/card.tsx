import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

const cardVariants = cva("border", {
  variants: {
    variant: {
      default: "rounded-card border-line bg-surface p-6 text-ink shadow-card",
      /** Hero balance card */
      hero: "rounded-hero border-ink bg-ink p-8 text-surface",
    },
  },
  defaultVariants: { variant: "default" },
});

export type CardProps = ComponentProps<"section"> & VariantProps<typeof cardVariants>;

export function Card({ className, variant, ...props }: CardProps) {
  return <section className={cn(cardVariants({ variant }), className)} {...props} />;
}

export function CardTitle({ className, ...props }: ComponentProps<"h3">) {
  return <h3 className={cn("text-card-title", className)} {...props} />;
}
