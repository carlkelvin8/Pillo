import { afterEach, describe, expect, it, vi } from "vitest";
import { motionSupported } from "./store";

function stubMatchMedia(reduced: boolean) {
  vi.stubGlobal("matchMedia", (q: string) => ({ matches: reduced && q.includes("reduce") }));
}

afterEach(() => vi.unstubAllGlobals());

describe("motionSupported", () => {
  it("needs both observers and no reduced-motion preference", () => {
    stubMatchMedia(false);
    vi.stubGlobal("IntersectionObserver", class {});
    vi.stubGlobal("ResizeObserver", class {});
    expect(motionSupported()).toBe(true);
    stubMatchMedia(true);
    expect(motionSupported()).toBe(false);
  });

  it("is false when an observer is missing", () => {
    stubMatchMedia(false);
    vi.stubGlobal("IntersectionObserver", class {});
    vi.stubGlobal("ResizeObserver", undefined);
    expect(motionSupported()).toBe(false);
  });
});
