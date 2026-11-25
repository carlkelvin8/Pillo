"use client";

import { Menu } from "lucide-react";
import { useState, type ReactNode } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

/** Slide-in navigation drawer for screens below the desktop sidebar breakpoint. */
export function MobileNav({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          aria-label="Open menu"
          className="rounded-control border-line bg-surface inline-flex size-11 items-center justify-center border lg:hidden"
        >
          <Menu className="size-5" aria-hidden="true" />
        </button>
      </DialogTrigger>
      <DialogContent
        onClick={(e) => {
          // Close after following a link inside the drawer.
          if ((e.target as HTMLElement).closest("a")) setOpen(false);
        }}
        className="rounded-r-card top-0 left-0 flex h-full max-h-none w-80 max-w-[85vw] translate-x-0 translate-y-0 flex-col gap-6 overflow-y-auto rounded-none"
      >
        <DialogTitle className="sr-only">Main menu</DialogTitle>
        <DialogDescription className="sr-only">Main navigation</DialogDescription>
        {children}
      </DialogContent>
    </Dialog>
  );
}
