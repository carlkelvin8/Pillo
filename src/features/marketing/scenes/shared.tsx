import type { CSSProperties, ReactNode } from "react";
import { DrPillAvatar, type DrPillMood } from "@/components/brand/dr-pill-avatar";
import { cn } from "@/lib/utils";

/** Inline CSS custom properties, typed. */
export const vars = (values: Record<string, string | number>) => values as CSSProperties;

/** Timing for scroll-scrubbed elements: starts at scene progress `s` and finishes `l` later. */
export const at = (s: number, l = 0.12, extra: Record<string, string | number> = {}) =>
  vars({ "--s": s, "--l": l, ...extra });

/**
 * Splits a sentence into words that light up one by one as the scene scrolls (set --ws/--wl on the heading
 * to choose when). The text stays a normal sentence for screen readers.
 */
export function Words({
  text,
  start = 0,
  length = 0.25,
  className,
}: {
  text: string;
  start?: number;
  length?: number;
  className?: string;
}) {
  const words = text.split(" ");
  return (
    <span
      className={cn("story-words", className)}
      style={vars({ "--n": words.length, "--ws": start, "--wl": length })}
    >
      {words.map((word, i) => (
        <span key={`${word}-${i}`} className="story-word" style={vars({ "--i": i })}>
          {word}
          {i < words.length - 1 ? " " : ""}
        </span>
      ))}
    </span>
  );
}

/**
 * Where Dr. Pill stands in a scene. With scripts on, the travelling mascot flies here; without scripts or
 * with reduced motion, this static copy is what the visitor sees.
 */
export function MascotSpot({
  mood = "happy",
  rotate = 0,
  className,
}: {
  mood?: DrPillMood;
  rotate?: number;
  className?: string;
}) {
  return (
    <span
      data-mascot-anchor=""
      data-mascot-mood={mood}
      data-mascot-rotate={rotate}
      aria-hidden="true"
      className={cn("story-spot pointer-events-none block aspect-[124/150]", className)}
    >
      <DrPillAvatar mood={mood} size={124} decorative className="h-auto w-full" />
    </span>
  );
}

export function Chapter({ n, label, className }: { n: string; label: string; className?: string }) {
  return (
    <p
      data-reveal=""
      className={cn(
        "story-chapter inline-flex w-fit items-center gap-3 text-xs font-semibold tracking-[0.18em] uppercase",
        className,
      )}
    >
      <span className="story-chapter-n tabular">{n}</span>
      <span aria-hidden="true" className="story-chapter-line" />
      {label}
    </p>
  );
}

/** A pinned, scroll-scrubbed scene. `len` is the scroll distance in viewport heights. */
export function Scene({
  id,
  label,
  len,
  tone = "light",
  children,
  className,
}: {
  id: string;
  label: string;
  len: number;
  tone?: "light" | "dark" | "mint";
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      id={id}
      data-scene={id}
      aria-labelledby={`${id}-title`}
      data-label={label}
      className={cn("story-scene", className)}
    >
      <div className="story-track" style={vars({ "--len": `${len}vh` })}>
        <div className={cn("story-stage", `story-${tone}`)}>{children}</div>
      </div>
    </section>
  );
}
