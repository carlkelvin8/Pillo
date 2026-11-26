"use client";

import { useEffect, useRef, useState } from "react";
import { clamp, hasFinePointer, lerp, prefersReducedMotion, subscribeFrame } from "./store";

const INTERACTIVE = "a, button, [data-cursor], summary, input, select, textarea, label";

/**
 * Custom cursor for mouse and trackpad users: a dot that sticks to the pointer and a ring that trails it,
 * stretches with speed, grows over links and buttons, and can show a label (data-cursor-label).
 * Decorative only: it is not rendered for touch, and not with reduced motion.
 */
export function StoryCursor() {
  const [enabled, setEnabled] = useState(false);
  const dot = useRef<HTMLSpanElement>(null);
  const ring = useRef<HTMLSpanElement>(null);
  const label = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    setEnabled(hasFinePointer() && !prefersReducedMotion());
  }, []);

  useEffect(() => {
    if (!enabled) return;
    let x = -100;
    let y = -100;
    let seen = false;
    let hover = false;
    let pressed = false;
    let text = "";
    let scale = 1;

    const over = (event: PointerEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      const interactive = target?.closest(INTERACTIVE) ?? null;
      hover = Boolean(interactive);
      const next = target?.closest<HTMLElement>("[data-cursor-label]")?.dataset.cursorLabel ?? "";
      if (next !== text) {
        text = next;
        if (label.current) {
          label.current.textContent = next;
          label.current.dataset.on = next ? "true" : "false";
        }
      }
    };
    const move = (event: PointerEvent) => {
      if (!seen) {
        // First move (or re-entry): jump the ring to the pointer instead of sliding in from a corner.
        x = event.clientX;
        y = event.clientY;
      }
      seen = true;
    };
    const down = () => (pressed = true);
    const up = () => (pressed = false);
    const leave = () => {
      seen = false;
    };
    window.addEventListener("pointermove", move, { passive: true });
    window.addEventListener("pointerover", over, { passive: true });
    window.addEventListener("pointerdown", down, { passive: true });
    window.addEventListener("pointerup", up, { passive: true });
    document.documentElement.addEventListener("pointerleave", leave);

    const unsubscribe = subscribeFrame((state, dt) => {
      const dx = state.mx - x;
      const dy = state.my - y;
      const follow = 1 - Math.exp(-dt / 70);
      x += dx * follow;
      y += dy * follow;
      const speed = Math.hypot(dx, dy);
      const angle = Math.atan2(dy, dx);
      const stretch = clamp(speed / 90, 0, 0.45);
      const targetScale = pressed ? 0.7 : hover ? (text ? 2.6 : 1.9) : 1;
      scale = lerp(scale, targetScale, 1 - Math.exp(-dt / 90));
      const visible = seen ? 1 : 0;
      if (dot.current) {
        dot.current.style.transform = `translate3d(${state.mx}px, ${state.my}px, 0) translate(-50%, -50%) scale(${hover ? 0.5 : 1})`;
        dot.current.style.opacity = String(visible);
      }
      if (ring.current) {
        ring.current.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%) rotate(${angle}rad) scale(${(scale * (1 + stretch)).toFixed(3)}, ${(scale * (1 - stretch * 0.5)).toFixed(3)})`;
        ring.current.style.opacity = String(visible);
        ring.current.dataset.hover = hover ? "true" : "false";
      }
      if (label.current) {
        label.current.style.transform = `translate3d(${x}px, ${y}px, 0) translate(18px, 18px)`;
        label.current.style.opacity = text ? String(visible) : "0";
      }
    });

    return () => {
      unsubscribe();
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerover", over);
      window.removeEventListener("pointerdown", down);
      window.removeEventListener("pointerup", up);
      document.documentElement.removeEventListener("pointerleave", leave);
    };
  }, [enabled]);

  if (!enabled) return null;
  // No wrapper: each piece is its own fixed layer so the dot and ring can blend with the page.
  return (
    <>
      <span ref={ring} className="story-cursor-ring" aria-hidden="true" />
      <span ref={dot} className="story-cursor-dot" aria-hidden="true" />
      <span ref={label} className="story-cursor-label" aria-hidden="true" data-on="false" />
    </>
  );
}
