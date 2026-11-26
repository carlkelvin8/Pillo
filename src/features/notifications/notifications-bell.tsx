"use client";

import { Bell } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { NotificationItem } from "./items";

/** Header bell: badge with the number of things needing attention; opens a list (full-width sheet on phones). */
export function NotificationsBell() {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [open, setOpen] = useState(false);
  const [failed, setFailed] = useState(false);
  const total = items.reduce((sum, item) => sum + item.count, 0);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications", { cache: "no-store" });
      if (!res.ok) throw new Error("bad status");
      const body = (await res.json()) as { items: NotificationItem[] };
      setItems(body.items);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 60_000);
    return () => window.clearInterval(timer);
  }, [load]);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) void load();
      }}
    >
      <DialogTrigger asChild>
        <button
          type="button"
          aria-label={total > 0 ? `Notifications, ${total} need attention` : "Notifications"}
          className="rounded-control border-line bg-surface text-ink hover:bg-subtle relative inline-flex size-11 shrink-0 items-center justify-center border"
        >
          <Bell className="size-[18px]" aria-hidden="true" />
          {total > 0 ? (
            <span
              aria-hidden="true"
              className="bg-ink text-surface absolute -top-1.5 -right-1.5 inline-flex min-w-5 items-center justify-center rounded-full px-1 text-[11px] leading-5 font-semibold"
            >
              {total > 99 ? "99+" : total}
            </span>
          ) : null}
        </button>
      </DialogTrigger>
      <DialogContent className="sm:rounded-b-card top-auto bottom-0 max-h-[85vh] w-full max-w-none translate-y-0 overflow-y-auto rounded-b-none sm:top-24 sm:right-6 sm:bottom-auto sm:left-auto sm:w-96 sm:translate-x-0">
        <DialogTitle>Notifications</DialogTitle>
        <DialogDescription>Things that need attention right now.</DialogDescription>
        {failed ? (
          <p className="text-muted mt-4 text-sm">
            We could not load notifications. Try again soon.
          </p>
        ) : items.length === 0 ? (
          <p className="text-muted mt-4 text-sm">You are all caught up.</p>
        ) : (
          <ul className="divide-line mt-4 flex flex-col divide-y">
            {items.map((item) => (
              <li key={item.id}>
                <Link
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className="hover:bg-subtle flex min-h-11 items-start gap-3 py-3"
                >
                  <span className="bg-mint text-mint-ink tabular inline-flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold">
                    {item.count}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold">{item.title}</span>
                    <span className="text-muted block text-sm">{item.detail}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
