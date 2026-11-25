"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Chip } from "@/components/ui/chip";
import { loadMoreConversationsAction } from "@/features/assistant/actions";
import type { InboxFilter } from "@/features/assistant/queries";
import { cn } from "@/lib/utils";

type Item = {
  id: string;
  status: "open" | "needs_human" | "resolved";
  handledBy: "ai" | "human";
  label: string;
  time: string;
  preview: string;
};

export function ConversationList({
  initialItems,
  initialTotal,
  filter,
  selectedId,
}: {
  initialItems: Item[];
  initialTotal: number;
  filter: InboxFilter;
  selectedId?: string;
}) {
  const [items, setItems] = useState(initialItems);
  const [total, setTotal] = useState(initialTotal);
  const [page, setPage] = useState(2);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const viewport = useRef<HTMLDivElement>(null);
  const sentinel = useRef<HTMLDivElement>(null);
  const loadingRef = useRef(false);

  useEffect(() => {
    setItems((current) => {
      return [
        ...initialItems,
        ...current.filter((item) => !initialItems.some((next) => next.id === item.id)),
      ];
    });
    setTotal(initialTotal);
  }, [initialItems, initialTotal]);

  const loadMore = useCallback(async () => {
    if (loadingRef.current || items.length >= total) return;
    loadingRef.current = true;
    setLoading(true);
    setError(false);
    try {
      const result = await loadMoreConversationsAction(page, filter);
      setItems((current) => {
        const ids = new Set(current.map((item) => item.id));
        return [...current, ...result.items.filter((item) => !ids.has(item.id))];
      });
      setTotal(result.total);
      setPage((current) => current + 1);
    } catch {
      setError(true);
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, [filter, items.length, page, total]);

  useEffect(() => {
    const root = viewport.current;
    const target = sentinel.current;
    if (!root || !target || !("IntersectionObserver" in window)) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) void loadMore();
      },
      { root, rootMargin: "120px" },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [loadMore]);

  const link = (id: string) =>
    `/dr-pill?${new URLSearchParams({ ...(filter === "needs" ? { filter } : {}), c: id })}`;

  return (
    <div
      ref={viewport}
      role="region"
      aria-label="Conversation list"
      className="max-h-[min(72vh,52rem)] overflow-y-auto overscroll-contain"
    >
      <ul className="flex flex-col">
        {items.map((item) => (
          <li key={item.id}>
            <Link
              href={link(item.id)}
              aria-current={item.id === selectedId ? "true" : undefined}
              className={cn(
                "rounded-control hover:bg-canvas flex min-h-11 flex-col gap-1 px-3 py-3",
                item.id === selectedId && "bg-canvas",
              )}
            >
              <span className="flex items-center justify-between gap-2">
                <span className="truncate font-semibold">{item.label}</span>
                <span className="tabular text-muted shrink-0 text-xs">{item.time}</span>
              </span>
              <span className="text-muted truncate text-sm">{item.preview}</span>
              <span>
                {item.status === "needs_human" ? (
                  <Chip tone="danger">Needs a human</Chip>
                ) : item.status === "resolved" ? (
                  <Chip tone="neutral">Resolved</Chip>
                ) : item.handledBy === "human" ? (
                  <Chip tone="pending">With staff</Chip>
                ) : (
                  <Chip tone="success">Dr. Pill</Chip>
                )}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {items.length < total ? (
        <div
          ref={sentinel}
          className="text-muted flex min-h-11 items-center justify-center text-xs"
          aria-live="polite"
        >
          {loading
            ? "Loading more conversations…"
            : error
              ? "Could not load more. Scroll to retry."
              : "Scroll for older conversations"}
          {error ? (
            <button
              type="button"
              className="ml-2 font-semibold underline"
              onClick={() => void loadMore()}
            >
              Try again
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
