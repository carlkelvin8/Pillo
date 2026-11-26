"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Stethoscope, Syringe, X } from "lucide-react";
import { DrPillAvatar } from "@/components/brand/dr-pill-avatar";
import { ASSISTANT_NAME } from "@/config/brand";
import { can, ROLE_LABELS, type Role } from "@/features/auth/permissions";
import { Button } from "@/components/ui/button";
import { navForRole } from "./nav-config";

type Position = { left: number; top: number };
type DragStart = Position & { pointerX: number; pointerY: number };
type CareAnimation = "idle" | "stethoscope" | "syringe";

const POSITION_KEY = "pillo-dr-pill-companion-position";
const PET_SIZE = 96;
const EDGE_GAP = 24;
const KEYBOARD_STEP = 24;
const CARE_CYCLE_MS = 12_000;

function clampPosition(position: Position): Position {
  const left = Math.min(Math.max(EDGE_GAP, position.left), window.innerWidth - PET_SIZE - EDGE_GAP);
  const top = Math.min(Math.max(EDGE_GAP, position.top), window.innerHeight - PET_SIZE - EDGE_GAP);
  return { left: Math.max(EDGE_GAP, left), top: Math.max(EDGE_GAP, top) };
}

function readSavedPosition(): Position | null {
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(POSITION_KEY) ?? "null");
    if (
      typeof value === "object" &&
      value !== null &&
      "left" in value &&
      "top" in value &&
      typeof value.left === "number" &&
      typeof value.top === "number" &&
      Number.isFinite(value.left) &&
      Number.isFinite(value.top)
    ) {
      return clampPosition({ left: value.left, top: value.top });
    }
  } catch {
    // Ignore invalid or unavailable browser storage and use the default position.
  }
  return null;
}

export function DrPillCompanion({ role }: { role: Role }) {
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [careAnimation, setCareAnimation] = useState<CareAnimation>("idle");
  const [position, setPosition] = useState<Position | null>(null);
  const dragStartRef = useRef<DragStart | null>(null);
  const draggedRef = useRef(false);
  const panelId = useId();
  const instructionsId = useId();
  const groups = navForRole(role);
  const mood = careAnimation !== "idle" ? "think" : open ? "excited" : hovered ? "wink" : "happy";

  useEffect(() => {
    const savedPosition = readSavedPosition();
    setPosition(
      savedPosition ??
        clampPosition({
          left: window.innerWidth - PET_SIZE - EDGE_GAP,
          top: window.innerHeight - PET_SIZE - EDGE_GAP,
        }),
    );
  }, []);

  useEffect(() => {
    const handleResize = () => {
      setPosition((current) => (current ? clampPosition(current) : current));
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

    let stopped = false;
    let timeoutId: number;
    const playStethoscope = () => {
      if (stopped) return;
      setCareAnimation("stethoscope");
      timeoutId = window.setTimeout(() => {
        if (stopped) return;
        setCareAnimation("syringe");
        timeoutId = window.setTimeout(() => {
          if (stopped) return;
          setCareAnimation("idle");
          timeoutId = window.setTimeout(playStethoscope, CARE_CYCLE_MS - 3_000);
        }, 1_500);
      }, 1_500);
    };
    timeoutId = window.setTimeout(playStethoscope, 4_000);

    return () => {
      stopped = true;
      window.clearTimeout(timeoutId);
    };
  }, []);

  // Escape closes the help panel, like every other popover in the app.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const savePosition = (next: Position) => {
    const clamped = clampPosition(next);
    setPosition(clamped);
    try {
      window.localStorage.setItem(POSITION_KEY, JSON.stringify(clamped));
    } catch {
      // The current session still keeps the position in component state.
    }
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    const start = dragStartRef.current;
    if (!start) return;
    const deltaX = event.clientX - start.pointerX;
    const deltaY = event.clientY - start.pointerY;
    if (Math.abs(deltaX) > 4 || Math.abs(deltaY) > 4) draggedRef.current = true;
    if (draggedRef.current) {
      document.getSelection()?.removeAllRanges();
      savePosition({ left: start.left + deltaX, top: start.top + deltaY });
    }
  };

  const finishPointer = () => {
    dragStartRef.current = null;
    window.setTimeout(() => {
      draggedRef.current = false;
    }, 0);
  };

  const moveWithKeyboard = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (!event.shiftKey || !event.key.startsWith("Arrow")) return;
    event.preventDefault();
    const current = position ?? {
      left: window.innerWidth - PET_SIZE - EDGE_GAP,
      top: window.innerHeight - PET_SIZE - EDGE_GAP,
    };
    const offsets = {
      ArrowLeft: { left: -KEYBOARD_STEP, top: 0 },
      ArrowRight: { left: KEYBOARD_STEP, top: 0 },
      ArrowUp: { left: 0, top: -KEYBOARD_STEP },
      ArrowDown: { left: 0, top: KEYBOARD_STEP },
    } as const;
    const offset = offsets[event.key as keyof typeof offsets];
    if (offset) savePosition({ left: current.left + offset.left, top: current.top + offset.top });
  };

  const style = position ? { left: position.left, top: position.top } : undefined;
  const atLeft = position ? position.left < window.innerWidth / 2 : false;
  const panelBelow = position ? position.top < window.innerHeight / 2 : false;

  return (
    <div
      className={`fixed z-40 size-24 ${position ? "" : "right-4 bottom-4 sm:right-6 sm:bottom-6"}`}
      style={style}
    >
      <span id={instructionsId} className="sr-only">
        Drag to move. Press Shift and an arrow key to reposition.
      </span>
      {open ? (
        <section
          id={panelId}
          role="region"
          aria-label={`${ASSISTANT_NAME} help`}
          className={`companion-panel-enter bg-surface border-line shadow-card rounded-card absolute z-30 max-h-[calc(100vh-2rem)] w-[min(22rem,calc(100vw-2rem))] overflow-y-auto border ${panelBelow ? "top-full mt-3" : "bottom-full mb-3"} ${atLeft ? "left-0" : "right-0"}`}
        >
          <header className="bg-ink text-surface flex items-center gap-3 px-4 py-3">
            <DrPillAvatar mood="happy" size={40} decorative />
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{ASSISTANT_NAME}</p>
              <p className="text-surface/70 text-xs">Quick help for your clinic</p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="border-surface/20 text-surface hover:bg-surface/10"
              aria-label="Dismiss help panel"
              onClick={() => setOpen(false)}
            >
              <X aria-hidden="true" />
            </Button>
          </header>
          <div className="flex flex-col gap-3 p-4">
            <p
              role="status"
              aria-live="polite"
              className="bg-mint text-mint-ink rounded-control flex min-h-11 items-center gap-2 px-3 text-xs font-semibold"
            >
              <span className="companion-status-pulse bg-mint-ink size-2 rounded-full" />
              Ready to help
            </p>
            <p className="text-muted text-sm leading-5">
              Hi! I can point you to the clinic tools available for your{" "}
              {ROLE_LABELS[role].toLowerCase()} account.
            </p>
            <nav aria-label="Clinic shortcuts" className="flex flex-col gap-3">
              {groups.map((group) => (
                <div key={group.label}>
                  <p className="text-muted mb-1 px-2 text-[11px] font-semibold tracking-wide uppercase">
                    {group.label}
                  </p>
                  <ul className="grid grid-cols-2 gap-1">
                    {group.items.map((item) => (
                      <li key={item.href}>
                        <Link
                          href={item.href}
                          onClick={() => setOpen(false)}
                          className="rounded-control hover:bg-subtle flex min-h-11 items-center gap-2 px-2 text-xs font-medium"
                        >
                          <item.icon className="size-4 shrink-0" aria-hidden="true" />
                          <span className="truncate">{item.label}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </nav>
            {can(role, "staff.manage") ? (
              <Link
                href="/dr-pill/ask"
                onClick={() => setOpen(false)}
                className="rounded-control bg-mint text-mint-ink hover:bg-mint-strong flex min-h-11 items-center justify-between gap-2 px-3 text-sm font-semibold"
              >
                Ask Dr. Pill <ArrowUpRight className="size-4" aria-hidden="true" />
              </Link>
            ) : null}
          </div>
        </section>
      ) : null}
      <button
        type="button"
        className="group text-ink focus-visible:outline-ink relative isolate grid size-24 cursor-grab touch-none place-items-center rounded-full bg-transparent p-0 transition-transform duration-200 select-none hover:scale-105 active:scale-95 active:cursor-grabbing motion-reduce:transition-none motion-reduce:hover:scale-100 motion-reduce:active:scale-100"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={open ? "Close Dr. Pill help" : "Open Dr. Pill help"}
        aria-describedby={instructionsId}
        aria-keyshortcuts="Shift+ArrowUp Shift+ArrowDown Shift+ArrowLeft Shift+ArrowRight"
        data-mood={mood}
        data-care-animation={careAnimation}
        onPointerDown={(event) => {
          if (!position) return;
          draggedRef.current = false;
          dragStartRef.current = {
            left: position.left,
            top: position.top,
            pointerX: event.clientX,
            pointerY: event.clientY,
          };
          event.currentTarget.setPointerCapture?.(event.pointerId);
        }}
        onPointerMove={handlePointerMove}
        onPointerUp={finishPointer}
        onPointerCancel={finishPointer}
        onPointerEnter={() => setHovered(true)}
        onPointerLeave={() => setHovered(false)}
        onFocus={() => setHovered(true)}
        onBlur={() => setHovered(false)}
        onKeyDown={moveWithKeyboard}
        onClick={() => {
          if (draggedRef.current) return;
          setOpen((value) => !value);
        }}
      >
        {!open ? (
          <span
            aria-hidden="true"
            className="companion-notification-dot border-canvas bg-mint-ink absolute top-2 right-3 z-20 size-4 rounded-full border-2"
          />
        ) : null}
        <span
          aria-hidden="true"
          className="bg-mint-strong/60 absolute inset-1 -z-10 rounded-full opacity-80 blur-xl transition-[inset,opacity] duration-300 group-hover:inset-0 group-hover:opacity-100 motion-reduce:transition-none"
        />
        <span className="pill-companion-float relative z-10 inline-flex">
          {careAnimation === "stethoscope" ? (
            <span className="pill-companion-stethoscope" aria-hidden="true">
              <Stethoscope className="text-mint-ink size-6" />
            </span>
          ) : null}
          {careAnimation === "syringe" ? (
            <span className="pill-companion-syringe" aria-hidden="true">
              <Syringe className="text-mint-ink size-6" />
            </span>
          ) : null}
          <DrPillAvatar mood={mood} size={88} decorative className="pill-companion-avatar" />
        </span>
      </button>
    </div>
  );
}
