# Data Visibility and Card Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make trend changes, patient details, and growing lists easier to see without expanding page height.

**Architecture:** Keep data reads server-side through existing Supabase queries. Make small presentation changes in the existing App Router pages and chart components; do not change financial semantics or schema.

**Tech Stack:** Next.js 15 App Router, TypeScript, Supabase, Tailwind CSS v4.

**Spec:** `docs/superpowers/specs/2026-11-25-ui-data-layout-design.md`

## Global Constraints

- Use the current clinic timezone and PHP formatting helpers.
- Preserve RLS and existing capabilities.
- No new dependencies or migrations; do not commit.
- Do not invent payment data or count pending payments as collections.

## Review Focus

- No succeeded payments in the previous month: comparison text must remain truthful and readable.
- Ten patients per page: next/previous links preserve the current filter and query.
- Long doctor and waitlist lists: list content scrolls inside cards without expanding the page.
- Patients with no phone, email, or birthdate: show a calm empty value without hiding the record link.
- Paid invoice with multiple succeeded payments: receipt summary totals only succeeded payments and formats the payment date in clinic time.

---

### Task 1: Dashboard trend deltas

**Files:**
- Modify `src/features/dashboard/trend-charts.tsx`

- [x] Add truthful month-over-month labels for collections and appointment counts based on the final two displayed months.
- [x] Keep existing chart data, accessible tables, and aggregate semantics unchanged.

### Task 2: Bounded appointment panels

**Files:**
- Modify `src/app/(app)/appointments/page.tsx`

- [x] Make doctor and waitlist lists independently scroll within bounded card regions.
- [x] Preserve the cards, row content, actions, and responsive layout.

### Task 3: Patient list details and pagination

**Files:**
- Modify `src/features/patients/queries.ts`
- Modify `src/app/(app)/patients/page.tsx`

- [x] Change server page size to 10.
- [x] Show birthdate, age/sex, phone, email, and a clear full-record link in each patient row.
- [x] Keep row pagination server-side and preserve filters/search.

### Task 4: Invoice receipt and payment card alignment

**Files:**
- Modify `src/app/(app)/invoices/[id]/page.tsx`
- Modify `src/app/(app)/payments/page.tsx`

- [x] Add a receipt summary for succeeded payments using existing invoice/payment data.
- [x] Align card headers, spacing, and responsive layout without changing payment actions.

### Task 5: Verify

- [x] Run `pnpm lint`, `pnpm typecheck`, and `git diff --check`.
- [x] Inspect Dashboard, Appointments, Patients, Payments, and a paid invoice in localhost Chrome.
