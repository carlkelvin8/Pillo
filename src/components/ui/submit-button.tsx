"use client";

import type { ComponentProps } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "./button";

type SubmitButtonProps = Omit<ComponentProps<typeof Button>, "type" | "asChild"> & {
  pendingLabel?: string;
};

/** Submit button that disables itself and shows progress while its form action runs. */
export function SubmitButton({
  children,
  pendingLabel = "Working…",
  disabled,
  ...props
}: SubmitButtonProps) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      disabled={pending || disabled}
      aria-disabled={pending || disabled}
      {...props}
    >
      {pending ? pendingLabel : children}
    </Button>
  );
}
