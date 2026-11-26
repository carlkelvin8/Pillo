# Clinic UI and Performance Polish Implementation Plan

> **For agentic workers:** Implement independent workstreams in parallel and keep changes uncommitted for the user to review.

**Goal:** Improve clinic navigation, appointment and invoice layouts, patient access to records, dashboard analytics, branch locations, and perceived message-send speed.

**Architecture:** Preserve the existing Next.js/Supabase architecture and design tokens. Use live clinic aggregates for monthly charts, existing branch coordinates for Leaflet/OpenStreetMap location pins, and keep patient-facing location display limited to explicit public branch data.

**Tech Stack:** Next.js 15 App Router, strict TypeScript, Supabase with RLS, Tailwind v4 tokens, Leaflet/OpenStreetMap, Vitest.

**Spec:** `docs/SPEC.md`, `CLAUDE.md`, and the user's requested screen changes in this conversation.

## Global Constraints

- Use APP_NAME from src/config/brand.ts. Never hard-code the product name.
- No hex colors in TSX. Use design tokens (bg-ink, text-muted, border-line, bg-mint, and so on).
- Money is integer centavos. Format only at the UI edge with src/lib/money.ts.
- Dates are clinic-local "YYYY-MM-DD"; convert only through src/lib/datetime.ts (Asia/Manila).
- Every new tenant table or column needs clinic_id, RLS, per-column grants, and tests in tests/db/.
- Clients never write clinic_id, invoice totals, or payment status. Derive them server-side.
- Server Actions use (prev, formData) => ActionState with useActionState, Zod validation, and echo non-sensitive values.
- Do not change files under docs/design/.

## Workstreams

1. Shell: increase the expanded sidebar slightly; keep the existing light design; verify the collapsed rail scales width, padding, icons, and spacing together.
2. Dashboard/payments/patients: show readable monthly trends based on Supabase totals, improve chart styling, place balance and collections cards together while keeping them distinct, widen transaction content, remove redundant summary UI, and add a clear patient-record link.
3. Appointments/invoices: reduce empty afternoon calendar height without changing availability semantics; align invoice details, payment/receipt action, and timeline.
4. Clinic/branches/chat: add useful clinic profile details supported by the current data model; use Leaflet with OpenStreetMap to pick and save branch coordinates and display public branch locations; reduce perceived message-send wait without duplicate writes or weakening rate limits.

## Review Focus

- Clinics with no historical trend values: keep honest zero/empty states instead of inventing chart data.
- Small viewports and collapsed navigation: maintain accessible labels, touch targets, and no horizontal overflow.
- Branches without coordinates or denied geolocation: allow manual map pin placement and preserve saved address details.
- Slow AI response: show the patient's submitted message promptly and preserve retry behavior without duplicating messages.
- Long clinic names, patient names, and invoice references: prevent text overlap in narrowed layouts.
