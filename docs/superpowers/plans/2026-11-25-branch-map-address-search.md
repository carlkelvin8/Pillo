# Branch Map Address Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Let clinic staff find a branch by address/place, set its map pin from a selected result, and remove visible coordinate inputs.

**Architecture:** Keep Leaflet map behavior in `BranchLocationMap`; put search input, explicit button/Enter search, result selection, loading, and errors in the existing client `BranchLocationField` without nesting a form inside the branch save form. Send searches through an authenticated route with a configurable Nominatim-compatible provider URL, one-second per-server request spacing, and five-minute cache. Choosing a result sets hidden form coordinates and centers the map at zoom 16 once. Keep click/drag pin interaction.

**Tech Stack:** Next.js client components, React, Leaflet, OpenStreetMap Nominatim, Vitest, Testing Library.

**Spec:** `docs/superpowers/specs/2026-11-25-branch-map-address-search-design.md`

## Global Constraints

- Search starts only after the user presses Search or Enter; never send autocomplete requests.
- Keep provider requests to no more than one per second per server runtime; serve identical queries from a five-minute cache.
- Keep the geocoding provider configurable through `GEOCODING_SEARCH_URL` without changing client code.
- Protect the geocoding route with the existing signed-in staff capability check.
- Preserve OpenStreetMap attribution on the map.
- Display OpenStreetMap attribution alongside returned search results.
- Remove visible latitude and longitude fields but continue submitting hidden coordinate inputs.

## Review Focus

- Empty or whitespace-only query: do not send a request; test that fetch is not called.
- Successful query with results: render selectable labels and selecting one updates hidden coordinates and map location; test this flow.
- Successful query with no results: show a clear empty state; test the message.
- Network/non-OK response: show a recoverable error and allow another search; test the message and enabled retry.
- Search submitted repeatedly within one second: API returns 429 without contacting the provider; test route behavior.

---

### Task 1: Authenticated, rate-limited provider endpoint

**Files:**

- Create: `src/app/api/geocoding/search/route.ts`
- Test: `src/app/api/geocoding/search/route.test.ts`

**Interfaces:**

- Consumes: `getWorkspace()` and `can(role, "staff.manage")`.
- Produces: `GET /api/geocoding/search?q=...`, returning up to five provider results, cached identical searches, and a 429 response when a provider request was made within the prior second.

- [x] **Step 1: Write failing tests** for configured provider URL and identifying User-Agent, blank query rejection, one-second request spacing, and identical-query caching.
- [x] **Step 2: Run** `pnpm exec vitest run src/app/api/geocoding/search/route.test.ts`; confirm expected failures.
- [x] **Step 3: Implement** the authenticated route with a 200-character query limit, configurable `GEOCODING_SEARCH_URL` (default Nominatim `/search`), 1-second server-runtime throttle, and 5-minute in-memory cache.
- [x] **Step 4: Run** the focused Vitest file; confirm it passes.

### Task 2: Address search field and geocoding results

**Files:**

- Modify: `src/features/branches/components/branch-location-field.tsx`
- Test: `src/features/branches/components/branch-location-field.test.tsx`

**Interfaces:**

- Consumes: `BranchLocationMap` props `latitude`, `longitude`, `onPin`.
- Produces: local search state and hidden `latitude`/`longitude` form inputs; selected result updates coordinate state. Search button does not submit the enclosing branch form; Enter searches from the query input.

- [x] **Step 1: Write failing tests** for explicit search, result selection, visible attribution, no results, request errors, Enter handling inside the parent form, and absence of visible coordinate fields.
- [x] **Step 2: Run** `pnpm exec vitest run src/features/branches/components/branch-location-field.test.tsx`; confirm expected failures.
- [x] **Step 3: Implement** an accessible search control with a type=button search action, Enter handling, loading/error/empty states, and selectable result buttons using the local endpoint's `/api/geocoding/search?q=...` response (`lat`, `lon`, `display_name`). Show linked OpenStreetMap attribution while results are visible. Keep selected coordinates in state and submit them through hidden inputs.
- [x] **Step 4: Run** the focused Vitest file; confirm it passes.

### Task 3: Center map on chosen result and preserve pin editing

**Files:**

- Modify: `src/features/branches/components/branch-location-map.tsx`
- Test: `src/features/branches/components/branch-location-map.test.tsx`

**Interfaces:**

- Consumes: updated latitude/longitude after selecting a result.
- Produces: map centers at zoom 16 once per selected search result; subsequent manual coordinate changes do not retrigger focus. Existing map click and marker drag continue to update coordinates.

- [x] **Step 1: Extend tests** to assert a selected search result recenters at zoom 16, later manual coordinate changes do not refocus, and reselecting a result recenters again; preserve existing marker setup tests.
- [x] **Step 2: Run** `pnpm exec vitest run src/features/branches/components/branch-location-map.test.tsx`; confirm expected failures.
- [x] **Step 3: Implement** map recenter behavior without changing click/drag placement.
- [x] **Step 4: Run** focused map tests.

### Task 4: Final verification

**Files:**

- Verify: route and both components with their tests.

- [x] Run `pnpm exec prettier --check` on changed files.
- [x] Run `pnpm exec vitest run src/app/api/geocoding/search/route.test.ts src/features/branches/components/branch-location-field.test.tsx src/features/branches/components/branch-location-map.test.tsx`.
- [x] Run `pnpm exec tsc --noEmit`.
