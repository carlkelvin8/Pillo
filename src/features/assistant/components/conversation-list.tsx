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

/**
 * Refresh merge: the fresh first page, then previously loaded rows (by id, old order, no duplicates).
 * A row from the old first page that is missing from the new one is kept only when it was pushed
 * off the end (it ranked after every surviving old row and the page did not shrink); otherwise it
 * left this view (resolved out of a filter) and is dropped.
 */
export function mergeRefreshedFirstPage<T extends { id: string }>(
  current: T[],
  firstPage: T[],
  previousFirstPage: T[],
): T[] {
  const fresh = new Set(firstPage.map((item) => item.id));
  const oldIndex = new Map(previousFirstPage.map((item, index) => [item.id, index]));
  const lastSurvivor = Math.max(
    -1,
    ...previousFirstPage.flatMap((item, index) => (fresh.has(item.id) ? [index] : [])),
  );
  const shrank = firstPage.length < previousFirstPage.length;
  const seen = new Set<string>();
  const kept: T[] = [];
  for (const item of current) {
    if (fresh.has(item.id) || seen.has(item.id)) continue;
    seen.add(item.id);
    const index = oldIndex.get(item.id);
    if (index !== undefined && (shrank || index < lastSurvivor)) continue;
    kept.push(item);
  }
  return [...firstPage, ...kept];
}

export function ConversationList({
  initialItems,
  initialTotal,
  filter,
  selectedId,
  pageSize,
}: {
  initialItems: Item[];
  initialTotal: number;
  filter: InboxFilter;
  selectedId?: string;
  /** Server page size (CONVERSATION_PAGE_SIZE): the next page is derived from the loaded row count. */
  pageSize: number;
}) {
  const [items, setItems] = useState(initialItems);
  const [total, setTotal] = useState(initialTotal);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const viewport = useRef<HTMLDivElement>(null);
  const sentinel = useRef<HTMLDivElement>(null);
  const loadingRef = useRef(false);
  const previousFirstPage = useRef(initialItems);

  useEffect(() => {
    // Refresh puts the fresh first page first (so a changed conversation never keeps a stale chip),
    // then every previously loaded row that is not in it, by id and in its old order. A row pushed
    // off page 1 by a new conversation stays visible. Rows that were on the old first page but are
    // gone from the new one are dropped (they left a filtered view).
    setItems((current) =>
      mergeRefreshedFirstPage(current, initialItems, previousFirstPage.current),
    );
    previousFirstPage.current = initialItems;
    setTotal(initialTotal);
  }, [initialItems, initialTotal]);

  const loadMore = useCallback(async () => {
    if (loadingRef.current || items.length >= total) return;
    loadingRef.current = true;
    setLoading(true);
    setError(false);
    try {
      // Continue from the number of distinct loaded rows. Rows can shift between pages as new
      // conversations arrive; re-fetching an overlapping page is safe because rows are merged by id.
      const page = Math.max(2, Math.floor(items.length / pageSize) + 1);
      const result = await loadMoreConversationsAction(page, filter);
      setItems((current) => {
        const ids = new Set(current.map((item) => item.id));
        return [...current, ...result.items.filter((item) => !ids.has(item.id))];
      });
      setTotal(result.total);
    } catch {
      setError(true);
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, [filter, items.length, pageSize, total]);

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
      className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
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
