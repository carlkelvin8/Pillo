"use client";

import { useEffect, useRef, useState } from "react";
import { DrPillAvatar, type DrPillMood } from "@/components/brand/dr-pill-avatar";
import { clamp, lerp, prefersReducedMotion, smooth, story, subscribeFrame } from "./store";

const BASE_WIDTH = 120;
const MOODS: DrPillMood[] = ["happy", "wink", "think", "sleepy", "listening", "talking", "excited"];

type Anchor = { el: HTMLElement; scene: number };

const readMood = (el: HTMLElement): DrPillMood => {
  const value = el.dataset.mascotMood as DrPillMood | undefined;
  return value && MOODS.includes(value) ? value : "happy";
};

/**
 * Dr. Pill as a guide that travels down the page. Every scene places an invisible
 * <span data-mascot-anchor data-mascot-mood="..." data-mascot-rotate="..."> where the mascot should stand
 * (its size is the mascot's size). While you scroll, the mascot glides from one anchor to the next, squashes
 * and stretches with scroll speed, leans toward the cursor and changes mood per chapter.
 */
export function StoryMascot() {
  const [enabled, setEnabled] = useState(false);
  const [mood, setMood] = useState<DrPillMood>("happy");
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setEnabled(!prefersReducedMotion());
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const sceneNodes = [...document.querySelectorAll<HTMLElement>("[data-scene]")];
    const anchors: Anchor[] = [...document.querySelectorAll<HTMLElement>("[data-mascot-anchor]")]
      .map((el) => ({ el, scene: sceneNodes.indexOf(el.closest<HTMLElement>("[data-scene]")!) }))
      .filter((anchor) => anchor.scene >= 0);
    if (anchors.length === 0) return;

    let px = 0;
    let py = 0;
    let scale = 1;
    let rotate = 0;
    let started = false;
    let currentMood: DrPillMood = "happy";
    const centre = (anchor: Anchor) => {
      const box = anchor.el.getBoundingClientRect();
      return { x: box.left + box.width / 2, y: box.top + box.height / 2, w: box.width };
    };

    const unsubscribe = subscribeFrame((state, dt) => {
      let next = 0;
      for (let i = 1; i < anchors.length; i++) {
        const top = story.scenes[anchors[i]!.scene]?.top;
        if (top !== undefined && state.y + state.vh > top) next = i;
      }
      let weight = 0;
      let from = anchors[0]!;
      let to = from;
      if (next > 0) {
        from = anchors[next - 1]!;
        to = anchors[next]!;
        const top = story.scenes[to.scene]?.top ?? 0;
        weight = smooth(clamp((state.y + state.vh - top) / state.vh));
      }
      const a = centre(from);
      const b = centre(to);
      const bob = Math.sin(performance.now() / 520) * 5;
      const targetX = lerp(a.x, b.x, weight);
      const targetY = lerp(a.y, b.y, weight) + bob;
      const targetScale = lerp(a.w, b.w, weight) / BASE_WIDTH;
      const baseRotate = lerp(
        Number(from.el.dataset.mascotRotate ?? 0),
        Number(to.el.dataset.mascotRotate ?? 0),
        weight,
      );
      const targetRotate = baseRotate + (state.nx - 0.5) * 14 + clamp(state.vy * 0.6, -22, 22);
      if (!started) {
        px = targetX;
        py = targetY;
        scale = targetScale;
        started = true;
      }
      const follow = 1 - Math.exp(-dt / 120);
      px += (targetX - px) * follow;
      py += (targetY - py) * follow;
      scale += (targetScale - scale) * follow;
      rotate += (targetRotate - rotate) * (1 - Math.exp(-dt / 110));
      const squash = clamp(Math.abs(state.vy) / 140, 0, 0.16);
      if (wrap.current) {
        wrap.current.style.transform = `translate3d(${px.toFixed(1)}px, ${py.toFixed(1)}px, 0) translate(-50%, -50%) rotate(${rotate.toFixed(2)}deg) scale(${(scale * (1 - squash * 0.6)).toFixed(3)}, ${(scale * (1 + squash)).toFixed(3)})`;
        wrap.current.style.opacity = "1";
      }
      const nextMood = readMood((weight < 0.5 ? from : to).el);
      if (nextMood !== currentMood) {
        currentMood = nextMood;
        setMood(nextMood);
      }
    });
    return unsubscribe;
  }, [enabled]);

  if (!enabled) return null;
  return (
    <div ref={wrap} className="story-mascot" aria-hidden="true" style={{ opacity: 0 }}>
      <DrPillAvatar mood={mood} size={BASE_WIDTH} decorative className="story-mascot-art" />
    </div>
  );
}
