# Draft invoice guard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent authenticated users from editing invoice header fields after an invoice leaves draft, while preserving lifecycle transitions.

**Architecture:** Replace the `private.guard_invoice()` trigger function in a new migration. Add database regression tests that verify draft edits still work and sent/paid invoice edits fail.

**Tech Stack:** PostgreSQL migration, Vitest database tests, Supabase RLS test harness.

**Spec:** `docs/superpowers/specs/2026-11-25-draft-invoice-guard-design.md`

## Global Constraints

- Money is integer centavos.
- Database triggers derive invoice totals.
- Do not apply migrations to live Supabase.
- Do not change files under `docs/design/`.

## Review Focus

- Sent invoice due date or patient change is rejected; test `freezes all editable headers after sending`.
- Paid invoice due date change is rejected; test `freezes invoice headers after payment`.
- Draft invoice header and line item edits remain supported; test `allows draft invoice edits`.
- Existing send, void, and payment-driven paid transitions remain supported; run the full database test suite.

---

### Task 1: Freeze non-draft invoice headers

**Files:**
- Create: `supabase/migrations/20261129000000_freeze_non_draft_invoices.sql`
- Modify: `tests/db/billing.test.ts`

**Interfaces:**
- Consumes: Existing `makeInvoice`, `asUserCommitted`, `failure`, and `admin` helpers.
- Produces: Trigger guard rejecting changes to patient, doctor, branch, issue date, due date, note, discount, and tax when the prior status is not `draft`.

- [ ] Add tests that attempt representative header edits on sent and paid invoices and permit header/item edits on drafts.
- [ ] Run `pnpm test:db` and confirm the sent/paid update assertions fail before the migration.
- [ ] Add a migration replacing `private.guard_invoice()` with the existing lifecycle logic and a complete non-draft header immutability check.
- [ ] Run `pnpm test:db` and confirm the new assertions and existing database tests pass.
- [ ] Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build`.

No live migration application and no commit are part of this task.
