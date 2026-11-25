"use client";

import { Switch as SwitchPrimitive } from "radix-ui";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

/** Toggle with an enlarged invisible hit area so the touch target is at least 44px. */
export function Switch({ className, ...props }: ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      className={cn(
        "bg-line-strong data-[state=checked]:bg-mint-ink relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors after:absolute after:-inset-2 after:content-[''] disabled:opacity-50",
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb className="bg-surface shadow-card block size-5 translate-x-1 rounded-full transition-transform data-[state=checked]:translate-x-6" />
    </SwitchPrimitive.Root>
  );
}
