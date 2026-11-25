"use client";

import { useState, type ReactNode } from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "./dialog";
import { cn } from "@/lib/utils";

type FormDialogProps = {
  /** The button that opens the dialog (rendered with asChild). */
  trigger: ReactNode;
  title: string;
  description?: string;
  className?: string;
  /** Receives `close` so a form can dismiss the dialog when its action succeeds. */
  children: (close: () => void) => ReactNode;
};

/** Dialog that scrolls on small screens and hands its children a close callback. */
export function FormDialog({ trigger, title, description, className, children }: FormDialogProps) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className={cn("max-h-[90vh] overflow-y-auto", className)}>
        <DialogTitle>{title}</DialogTitle>
        {description ? (
          <DialogDescription>{description}</DialogDescription>
        ) : (
          <DialogDescription className="sr-only">{title}</DialogDescription>
        )}
        <div className="mt-5">{children(() => setOpen(false))}</div>
      </DialogContent>
    </Dialog>
  );
}
