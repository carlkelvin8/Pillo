import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

const controlClasses =
  "min-h-11 w-full rounded-control border border-line-strong bg-surface px-4 text-sm text-ink placeholder:text-muted aria-[invalid=true]:border-danger-chip-ink disabled:opacity-50";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cn(controlClasses, className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea className={cn(controlClasses, "min-h-24 py-3", className)} {...props} />;
}

export function Select({ className, ...props }: ComponentProps<"select">) {
  return <select className={cn(controlClasses, "pr-8", className)} {...props} />;
}
