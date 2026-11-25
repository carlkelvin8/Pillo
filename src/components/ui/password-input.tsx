"use client";

import { useState, type ComponentProps } from "react";
import { cn } from "@/lib/utils";
import { Input } from "./input";

/** Password field with a Show/Hide toggle (design: "Show"). */
export function PasswordInput({ className, ...props }: Omit<ComponentProps<typeof Input>, "type">) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <Input type={visible ? "text" : "password"} className={cn("pr-20", className)} {...props} />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-pressed={visible}
        className="rounded-control text-muted hover:text-ink absolute top-0 right-1 inline-flex min-h-11 items-center px-3 text-sm font-medium"
      >
        {visible ? "Hide" : "Show"}
      </button>
    </div>
  );
}
