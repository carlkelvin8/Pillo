# MVP Backlog Implementation Plan

> **For agentic workers:** Execute inline in this session. Keep each item reviewable and verify it before continuing.

**Goal:** Close the agreed scheduling and billing MVP gaps, keep the Dr. Pill command-center surface distinct from the synthetic demo, verify the complete repository, and push the finished work to `origin/main`.

**Architecture:** Reuse existing tenant-scoped Supabase queries, actions, tables, RLS, audit helpers, and design components. Add no database schema unless existing policies prove insufficient; do not apply migrations to live Supabase. Keep Gemini limited to fixed synthetic prompts.

**Tech Stack:** Next.js 15 App Router, TypeScript, Supabase, Zod, Vitest, Postgres tests, `pdf-lib` for server-generated in-memory invoice PDFs.

**Spec:** `docs/SPEC.md`, `CLAUDE.md`, and the Phase 2/3 leftovers requested in the conversation.

## Global Constraints

- Use `APP_NAME`; use design tokens; money is integer centavos; clinic dates use `src/lib/datetime.ts`.
- Derive clinic scope from the signed-in membership; preserve RLS and existing per-column grants.
- Do not send live clinic or patient data to a model or external messaging provider.
- Do not edit `docs/design/`; do not commit secrets.
- No live Supabase migration application; no SMS, Messenger, or Viber sending.

## Review Focus

- Cross-clinic IDs submitted to patient/invoice/hour actions must be rejected by clinic-scoped queries and RLS.
- Invalid, oversized, duplicate, or partially valid CSV input must preview safely and import valid rows only.
- Hour windows that are empty, reversed, adjacent, overlapping, or on another branch must preserve the documented availability rule.
- Only draft invoices may be edited; server-computed totals remain authoritative.
- PDF/link audit metadata must not contain patient names or contact information.

### Task 1: Doctor hours and month calendar

**Files:** scheduling settings page/components/actions/queries, `slots.ts` tests, appointments page and calendar tests.

- [x] Add a branch/doctor scoped editor for weekly windows, including add/edit/remove and the no-rows rule.
- [x] Validate valid times and non-overlap per weekday/doctor/branch.
- [x] Add month view with one existing range query and per-day counts linking to day view.
- [x] Run focused scheduling tests and verify the UI at localhost.

### Task 2: Patient CSV import and billing tab

**Files:** patient import parser/tests, actions, patient list UI, patient queries and record page.

- [x] Parse a maximum 1 MB / 1,000 data rows, preview row-level errors, and insert valid rows only.
- [x] Leave `consent_at` null and write one counts-only audit event per import.
- [x] Show invoices, outstanding balances, and payment history on the existing audited patient record.
- [x] Run parser, patient, and DB authorization tests.

### Task 3: Invoice draft editing, PDF, and share-message MVP

**Files:** invoice actions/schemas/forms/pages, PDF route and dependency, billing tests.

- [x] Edit patient, due date, and line items only while the invoice is draft; keep totals database-derived.
- [x] Generate PDFs on demand on the server, log a privacy-safe download event, and authorize by invoice/payment capability.
- [x] Reuse existing payment-link creation, show a copyable message, and audit `invoice.link_shared`.
- [x] Verify draft-only trigger behavior and billing tests. A local migration adds an atomic update RPC; do not apply it to live Supabase until requested.

### Task 4: Dr. Pill route separation and docs

**Files:** Dr. Pill routes/tabs and `docs/SPEC.md`.

- [x] Keep the synthetic skills lab clearly local/demo-only; live model calls remain paused.
- [x] Update Phase 2/3 status and remaining later-phase roadmap accurately.

### Task 5: Full verification and push

- [x] Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:db`, and `pnpm build`.
- [x] Review the final diff and ensure no secrets or unrelated user data are included.
- [ ] Commit the requested implementation and push `main` to `origin`.

## Out of scope for this MVP

Messenger/Viber/SMS provider sending, OTP identity verification, auto-send, the patient PWA, marketing and predictive AI, treatment-plan explanation, and clinical voice charting remain roadmap work requiring separate provider, consent, or clinical workflow decisions.
