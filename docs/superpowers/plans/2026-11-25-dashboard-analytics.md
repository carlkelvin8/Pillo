# Dashboard Analytics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Balance the dashboard metrics and show monthly collections and appointment trends in accessible charts.

**Architecture:** Keep the dashboard server-rendered. Add a server query that retrieves only appointment start timestamps for the displayed period, then group by the clinic-local month. Render accessible server-side SVG/HTML charts without adding a library.

**Tech Stack:** Next.js App Router, TypeScript, Supabase server client, Vitest, Tailwind CSS v4.

**Spec:** `docs/superpowers/specs/2026-11-25-dashboard-analytics-design.md`

## Global Constraints

- No new dependencies or migrations.
- Money is formatted with `src/lib/money.ts`; clinic-local dates use `src/lib/datetime.ts`.
- Preserve role-based visibility for money, invoice, schedule, and staff capabilities.
- Use design tokens; no hard-coded colors in TSX.
- Do not commit changes.

## Review Focus

- Clinic-local month boundaries: test an appointment whose UTC timestamp falls in a different local month.
- Months without appointments: chart/table must show all twelve months with zero counts.
- Cancelled appointments: exclude them from the appointment trend.
- Staff without `schedule.view`: do not fetch or render appointment trends.
- Responsive and accessible charts: expose a useful accessible name and a screen-reader table equivalent.

---

### Task 1: Aggregate appointment trend data

**Files:**

- Create `src/features/scheduling/dashboard-trend.ts`
- Create `src/features/scheduling/dashboard-trend.test.ts`
- Modify `src/features/scheduling/queries.ts`

**Interfaces:**

- Produce `countAppointmentStartsByMonth(startsAt: string[], timezone: string): Map<string, number>`.
- Produce `monthlyAppointmentCounts(clinicId: string, fromIso: string, toIso: string, timezone: string): Promise<Map<string, number>>`; query only non-cancelled appointment `starts_at` values in the half-open interval and paginate at 1,000 rows.

- [x] Write a failing helper test for clinic-local month bucketing and UTC month crossover.
- [x] Run `pnpm exec vitest run src/features/scheduling/dashboard-trend.test.ts` and confirm the missing helper causes the expected failure.
- [x] Implement the pure aggregation helper and paginated, patient-free Supabase query.
- [x] Run the helper test and confirm it passes.

### Task 2: Render balanced dashboard analytics

**Files:**

- Create `src/features/dashboard/trend-charts.tsx`
- Create `src/features/dashboard/trend-charts.test.tsx`
- Create `src/features/dashboard/layout.ts`
- Create `src/features/dashboard/layout.test.ts`
- Modify `src/app/(app)/dashboard/page.tsx`

**Interfaces:**

- `CollectionsBarChart({ months, values, total })` renders the existing 12-month collections data.
- `AppointmentsLineChart({ months, values })` renders monthly appointment counts.

- [x] Write failing component tests for chart accessible names, twelve month rows, and zero-value months.
- [x] Run the dashboard chart test and confirm the expected missing-component failure.
- [x] Render both charts as high-contrast token-colored SVG/HTML with `role="img"` and screen-reader tables.
- [x] Move the collections chart next to the appointment chart; keep the clinic balance hero separate.
- [x] Keep charts paired at medium widths by spanning the balance hero across both columns; align all three cards at XL.
- [x] Change the metrics grid to four columns on extra-large screens, two on medium screens, and one on small screens.
- [x] Fetch monthly appointment trend only when `schedule.view` is allowed; exclude cancelled rows and pass no patient identifiers to the chart.
- [x] Run chart tests and confirm they pass.

### Task 3: Verify dashboard changes

- [x] Run `pnpm lint`.
- [x] Run `pnpm typecheck`.
- [x] Run `pnpm test`.
- [x] Run `pnpm test:db` (no schema migration expected).
- [x] Run `pnpm build`.
- [x] Run `git diff --check` and inspect the dashboard in localhost Chrome.
