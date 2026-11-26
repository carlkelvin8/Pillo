"use client";

import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import type { SearchResponse, SearchResult } from "./schema";

const GROUP_LABEL = { patients: "Patients", invoices: "Invoices" } as const;

export type HeaderSearchProps = { className?: string };

/** Header search combobox: patients (name, phone) and invoices (INV number). Arrow keys, Enter, Escape. */
export function HeaderSearch({ className = "" }: HeaderSearchProps) {
  const router = useRouter();
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const trimmed = query.trim();
  const ready = trimmed.length >= 2;

  useEffect(() => {
    if (!ready) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      setFailed(false);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(trimmed)}`, {
          signal: controller.signal,
        });
        if (!res.ok) throw new Error("search failed");
        const body = (await res.json()) as SearchResponse;
        setResults(body.results);
        setActive(-1);
      } catch (error) {
        if ((error as Error).name !== "AbortError") {
          setResults([]);
          setFailed(true);
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [trimmed, ready]);

  useEffect(() => {
    const close = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);

  const go = (result: SearchResult) => {
    setOpen(false);
    setQuery("");
    setResults([]);
    router.push(result.href);
  };

  const visible = ready ? results : [];
  const listRendered = open && ready;
  const status = !ready
    ? ""
    : loading
      ? "Searching…"
      : failed
        ? "Search is unavailable. Try again."
        : visible.length === 0
          ? "No matches."
          : `${visible.length} ${visible.length === 1 ? "result" : "results"}`;

  return (
    <div
      ref={rootRef}
      onBlur={(event) => {
        const next = event.relatedTarget as Node | null;
        if (next && !event.currentTarget.contains(next)) setOpen(false);
      }}
      className={`relative min-w-0 max-w-90 flex-1 ${className}`}
    >
      <div className="rounded-control border-line bg-surface focus-within:outline-ink flex min-h-11 items-center gap-2.5 border px-4 focus-within:outline-2 focus-within:outline-offset-2">
        <Search className="text-muted size-4 shrink-0" aria-hidden="true" />
        <input
          type="search"
          role="combobox"
          aria-label="Search patients and invoices"
          aria-expanded={open && ready}
          aria-controls={listRendered ? listId : undefined}
          aria-autocomplete="list"
          aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
          autoComplete="off"
          placeholder="Search patients or INV number"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setResults([]);
            setActive(-1);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              setOpen(false);
            } else if (event.key === "ArrowDown" && visible.length) {
              event.preventDefault();
              setOpen(true);
              setActive((i) => (i + 1) % visible.length);
            } else if (event.key === "ArrowUp" && visible.length) {
              event.preventDefault();
              setActive((i) => (i <= 0 ? visible.length - 1 : i - 1));
            } else if (event.key === "Enter") {
              const target = active >= 0 ? visible[active] : undefined;
              if (target) {
                event.preventDefault();
                // A request is pending or the list belongs to an older query: do nothing yet.
                if (!loading) go(target);
              }
            }
          }}
          className="placeholder:text-muted w-full min-w-0 bg-transparent text-sm outline-none"
        />
      </div>
      <p className="sr-only" role="status" aria-live="polite">
        {status}
      </p>
      {open && ready ? (
        <div className="rounded-card border-line bg-surface shadow-card fixed inset-x-4 top-20 z-50 max-h-[70vh] overflow-y-auto border p-2 sm:absolute sm:inset-x-auto sm:top-full sm:mt-2 sm:w-96 sm:max-w-[calc(100vw-2rem)]">
          <ul id={listId} role="listbox" aria-label="Search results" className="flex flex-col">
            {visible.map((result, index) => (
              <li
                key={`${result.group}-${result.id}`}
                id={`${listId}-${index}`}
                role="option"
                aria-selected={index === active}
                onPointerDown={(event) => event.preventDefault()}
                onClick={() => go(result)}
                className={`rounded-control flex min-h-11 cursor-pointer flex-col justify-center px-3 py-2 ${
                  index === active ? "bg-subtle" : "hover:bg-subtle"
                }`}
              >
                <span className="text-muted text-[11px] font-semibold tracking-[0.08em] uppercase">
                  {GROUP_LABEL[result.group]}
                </span>
                <span className="truncate text-sm font-semibold">{result.title}</span>
                {result.subtitle ? (
                  <span className="text-muted truncate text-xs">{result.subtitle}</span>
                ) : null}
              </li>
            ))}
          </ul>
          {visible.length === 0 ? (
            <p className="text-muted px-3 py-4 text-sm">{status}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
