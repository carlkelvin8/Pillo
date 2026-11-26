# Marketing Hero Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep the animated Pillo story while making the landing-page hero clear and fully usable on desktop and short mobile screens.

**Architecture:** Preserve the existing `HeroScene` component and story engine. Add browser assertions for real viewport geometry, then make responsive CSS adjustments in the existing story stylesheet without changing copy or adding a dependency.

**Tech Stack:** Next.js 15, React, Tailwind v4, existing Playwright E2E setup.

**Spec:** `docs/superpowers/specs/2026-11-26-marketing-hero-polish-design.md`

## Global Constraints

- Use `APP_NAME` from `src/config/brand.ts`; do not hard-code the product name.
- Keep colors on existing design tokens; no hex colors in TSX.
- Preserve reduced-motion and no-script readability.
- Keep the current hero headline and supporting copy.
- Add no dependencies.

## Review Focus

- Short phone viewport: the primary signup action must remain inside the first screen and avoid clipping.
- Narrow phone viewport: no horizontal overflow or overlap between the headline and supporting copy.
- Tablet and desktop: mascot art must remain separate from the headline and signup actions.
- Reduced motion: hero copy and signup action must stay visible when animations are disabled.
- No JavaScript: hero copy and signup action must remain readable.
- Fixed header: it must not cover the headline or signup action.

---

### Task 1: Pin hero viewport behavior

**Files:**
- Create: `e2e/landing-hero.spec.ts`
- Read: `src/features/marketing/scenes/hero.tsx`
- Read: `src/features/marketing/story.css`

**Interfaces:**
- Consumes: Existing `/` landing route and existing Playwright `page` fixture.
- Produces: Browser checks for 390×667 mobile and 1440×900 desktop viewports.

- [x] **Step 1: Add the failing viewport test**

  Add checks for 320×568 and 390×667 that the hero heading and `Create your clinic` link fit within the visible viewport with no horizontal overflow. At 1440×900, check that the fixed header stays above the heading and the desktop CTA does not overlap the mascot anchor. Add reduced-motion and JavaScript-disabled checks that the heading and CTA remain readable.

- [x] **Step 2: Run the focused browser test and verify the expected failure**

  Run: `pnpm exec playwright test e2e/landing-hero.spec.ts`

  Expected: FAIL only where the current hero clips or overlaps at the tested viewport.

### Task 2: Rebalance hero layout for compact viewports

**Files:**
- Modify: `src/features/marketing/story.css`
- Modify: `src/features/marketing/landing.tsx`
- Test: `e2e/landing-hero.spec.ts`

**Interfaces:**
- Consumes: The viewport assertions from Task 1.
- Produces: Responsive hero sizing and spacing while preserving the current story scene.

- [x] **Step 1: Adjust hero spacing and mascot scale with existing CSS breakpoints**

  Preserve the desktop two-column layout. For narrow or short screens, reduce decorative orbit height and tune text spacing so the headline, copy, and primary CTA remain legible within the sticky stage. In the `noscript` style, keep hero content fully visible. Keep the scroll-driven animation and reduced-motion rules intact.

- [x] **Step 2: Run the focused browser test**

  Run: `pnpm exec playwright test e2e/landing-hero.spec.ts`

  Expected: PASS at both viewports with no clipped primary content, horizontal overflow, or desktop mascot overlap.

- [x] **Step 3: Run the landing unit tests**

  Run: `pnpm exec vitest run src/features/marketing/landing.test.tsx`

  Expected: all landing tests pass.

- [x] **Step 4: Run the production build**

  Run: `pnpm build`

  Expected: the production build exits with code 0.
