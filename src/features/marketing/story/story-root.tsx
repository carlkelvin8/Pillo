"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { StoryCursor } from "./cursor";
import { StoryMascot } from "./mascot";
import { clamp, COMPACT_QUERY, hasFinePointer, motionSupported, story, subscribeFrame } from "./store";

type SceneBox = { el: HTMLElement; top: number; height: number };

/**
 * Wraps the landing page. It turns scroll position into CSS variables the scenes animate from:
 *   --scroll (root)   0..1 of the whole page         --vy (root)  scroll velocity
 *   --p (scene)       0..1 while the scene is pinned  --in (scene) 0..1 as the scene enters
 * It also reveals [data-reveal] elements, tilts [data-tilt] cards and pulls [data-magnetic] buttons.
 * With reduced motion nothing is scrubbed: every scene shows its finished state.
 */
export function StoryRoot({ children }: { children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    // Old browsers and test environments without these APIs get the plain page.
    if (!motionSupported()) {
      el.dataset.motion = "reduced";
      return;
    }
    el.dataset.motion = "full";
    el.classList.add("story-js");
    const fine = hasFinePointer();
    if (fine) el.classList.add("story-cursor-on");

    const scenes: SceneBox[] = [];
    const measureScenes = () => {
      scenes.length = 0;
      for (const node of el.querySelectorAll<HTMLElement>("[data-scene]")) {
        const rect = node.getBoundingClientRect();
        scenes.push({ el: node, top: rect.top + window.scrollY, height: rect.height });
      }
      story.scenes = scenes.map(({ top, height }) => ({ top, height }));
    };
    measureScenes();
    const resizeObserver = new ResizeObserver(measureScenes);
    resizeObserver.observe(el);
    window.addEventListener("load", measureScenes);

    // Reveal-on-enter for plain elements.
    const reveal = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            (entry.target as HTMLElement).dataset.in = "true";
            reveal.unobserve(entry.target);
          }
        }
      },
      { rootMargin: "0px 0px -12% 0px", threshold: 0.12 },
    );
    for (const node of el.querySelectorAll("[data-reveal]")) reveal.observe(node);

    // On short screens only the hero keeps scrubbing; other scenes show their finished state (see story.css).
    const compactQuery = typeof window.matchMedia === "function" ? window.matchMedia(COMPACT_QUERY) : null;
    let compact = compactQuery?.matches ?? false;
    const applyCompact = () => {
      if (compact) el.dataset.compact = "true";
      else delete el.dataset.compact;
      if (compact) {
        for (const scene of scenes) {
          if (scene.el.dataset.scene === "hero") continue;
          scene.el.style.removeProperty("--p");
          scene.el.style.removeProperty("--in");
        }
      }
    };
    const onCompactChange = () => {
      compact = compactQuery?.matches ?? false;
      applyCompact();
    };
    applyCompact();
    compactQuery?.addEventListener("change", onCompactChange);

    let active = "";
    const unsubscribe = subscribeFrame((state) => {
      el.style.setProperty("--scroll", state.scroll.toFixed(4));
      el.style.setProperty("--vy", state.vy.toFixed(2));
      let chapter = "hero";
      scenes.forEach((scene) => {
        if (compact && scene.el.dataset.scene !== "hero") return;
        const travel = Math.max(1, scene.height - state.vh);
        const p = clamp((state.y - scene.top) / travel);
        const entering = clamp((state.y + state.vh - scene.top) / state.vh);
        scene.el.style.setProperty("--p", p.toFixed(4));
        scene.el.style.setProperty("--in", entering.toFixed(4));
        // Passive scenes (the marquee bands) animate but are not chapters.
        if (state.y + state.vh * 0.5 >= scene.top && scene.el.dataset.passive === undefined) {
          chapter = scene.el.dataset.scene ?? chapter;
        }
      });
      if (chapter !== active) {
        active = chapter;
        el.dataset.active = chapter;
      }
    });

    // Cursor-driven effects: magnetic buttons and tilting cards.
    const cleanups: (() => void)[] = [];
    if (fine) {
      for (const node of el.querySelectorAll<HTMLElement>("[data-magnetic]")) {
        const move = (event: PointerEvent) => {
          const box = node.getBoundingClientRect();
          const dx = event.clientX - (box.left + box.width / 2);
          const dy = event.clientY - (box.top + box.height / 2);
          node.style.transform = `translate3d(${dx * 0.22}px, ${dy * 0.3}px, 0)`;
        };
        const leave = () => {
          node.style.transform = "";
        };
        node.addEventListener("pointermove", move);
        node.addEventListener("pointerleave", leave);
        cleanups.push(() => {
          node.removeEventListener("pointermove", move);
          node.removeEventListener("pointerleave", leave);
        });
      }
      for (const node of el.querySelectorAll<HTMLElement>("[data-tilt]")) {
        const move = (event: PointerEvent) => {
          const box = node.getBoundingClientRect();
          const x = (event.clientX - box.left) / box.width - 0.5;
          const y = (event.clientY - box.top) / box.height - 0.5;
          node.style.setProperty("--rx", `${(-y * 8).toFixed(2)}deg`);
          node.style.setProperty("--ry", `${(x * 10).toFixed(2)}deg`);
        };
        const leave = () => {
          node.style.setProperty("--rx", "0deg");
          node.style.setProperty("--ry", "0deg");
        };
        node.addEventListener("pointermove", move);
        node.addEventListener("pointerleave", leave);
        cleanups.push(() => {
          node.removeEventListener("pointermove", move);
          node.removeEventListener("pointerleave", leave);
        });
      }
    }

    return () => {
      unsubscribe();
      compactQuery?.removeEventListener("change", onCompactChange);
      reveal.disconnect();
      resizeObserver.disconnect();
      window.removeEventListener("load", measureScenes);
      for (const cleanup of cleanups) cleanup();
      el.classList.remove("story-js", "story-cursor-on");
      delete el.dataset.motion;
      delete el.dataset.active;
      delete el.dataset.compact;
      for (const scene of scenes) {
        scene.el.style.removeProperty("--p");
        scene.el.style.removeProperty("--in");
      }
    };
  }, []);

  return (
    <div ref={root} className="story-root" data-active="hero">
      <div className="story-progress" aria-hidden="true">
        <span className="story-progress-bar" />
      </div>
      <StoryCursor />
      <StoryMascot />
      {children}
    </div>
  );
}
