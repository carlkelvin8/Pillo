/**
 * One requestAnimationFrame loop shared by every landing-page effect (scroll scenes, cursor, mascot).
 * Values are plain mutable fields: effects write CSS variables / transforms directly, never React state,
 * so a 60 fps scroll never re-renders React.
 */
export type StoryState = {
  /** Page scroll position in px and as 0..1 of the scrollable distance. */
  y: number;
  scroll: number;
  /** Smoothed scroll velocity in px per frame (positive = scrolling down). */
  vy: number;
  /** Pointer position in px, and 0..1 of the viewport. */
  mx: number;
  my: number;
  nx: number;
  ny: number;
  vw: number;
  vh: number;
  /** Scene positions (document px), measured by the scene engine. */
  scenes: { top: number; height: number }[];
};

export const story: StoryState = {
  y: 0,
  scroll: 0,
  vy: 0,
  mx: 0,
  my: 0,
  nx: 0.5,
  ny: 0.5,
  vw: 1280,
  vh: 800,
  scenes: [],
};

type FrameCallback = (state: StoryState, dtMs: number) => void;
const subscribers = new Set<FrameCallback>();
let raf = 0;
let last = 0;
let lastY = 0;

function onPointerMove(event: PointerEvent) {
  story.mx = event.clientX;
  story.my = event.clientY;
  story.nx = event.clientX / Math.max(1, window.innerWidth);
  story.ny = event.clientY / Math.max(1, window.innerHeight);
}

function measure() {
  story.vw = window.innerWidth;
  story.vh = window.innerHeight;
}

function loop(now: number) {
  const dt = Math.min(64, now - last || 16);
  last = now;
  const y = window.scrollY;
  const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
  // Ease the velocity so squash-and-stretch effects settle instead of snapping.
  story.vy += (y - lastY - story.vy) * 0.18;
  lastY = y;
  story.y = y;
  story.scroll = Math.min(1, Math.max(0, y / max));
  for (const callback of subscribers) callback(story, dt);
  raf = requestAnimationFrame(loop);
}

/** Subscribe to the shared frame loop. Returns the unsubscribe function. */
export function subscribeFrame(callback: FrameCallback): () => void {
  subscribers.add(callback);
  if (subscribers.size === 1) {
    measure();
    lastY = window.scrollY;
    last = performance.now();
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("resize", measure, { passive: true });
    raf = requestAnimationFrame(loop);
  }
  return () => {
    subscribers.delete(callback);
    if (subscribers.size === 0) {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("resize", measure);
    }
  };
}

export const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** Smooth ease in/out for 0..1. */
export const smooth = (t: number) => t * t * (3 - 2 * t);

/** True when the visitor asked the OS for less motion. */
export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
    : false;
}

/** True for a mouse or trackpad (a precise, hovering pointer). */
export function hasFinePointer(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia("(hover: hover) and (pointer: fine)").matches
    : false;
}
