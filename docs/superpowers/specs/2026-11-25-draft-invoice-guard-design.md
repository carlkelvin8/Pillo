# Draft invoice guard design

## Intent

Ensure that only draft invoices can be edited, including their patient, due date, notes, clinician/branch, discounts, taxes, and line items. Sent and paid invoices must remain unchanged while existing lifecycle transitions (send, void, and payment-triggered paid status) continue to work.

## Constraints

- Keep the existing signed-in Supabase client, RLS, and clinic scoping.
- Keep totals derived by existing database triggers; clients do not write totals.
- Do not apply migrations to live Supabase as part of this change.
- Add database tests proving sent and paid invoices cannot be edited.

## Approaches

1. **Tighten the database invoice guards (recommended).** Add a migration that rejects changes to editable invoice fields unless the old status is `draft`, and retain the existing controlled status transitions. Keep item guards and add coverage for both sent and paid rows. This enforces the rule even for writes outside the UI.
2. **Restrict only the UI action.** Hide or disable edit controls for non-drafts. This leaves direct authenticated database updates able to change fields such as `due_on`, so it does not meet the requirement.

## Design

Use a new Supabase migration to extend the invoice guard over every editable header field while preserving status transitions and trigger-derived timestamps/totals. Keep the current role-based update policy because staff need permitted lifecycle transitions after draft status; the trigger will enforce which field changes are allowed. Add regression tests to `tests/db/billing.test.ts` for attempts to edit sent and paid invoice headers and items, plus a positive draft edit case. Do not touch `docs/design/`.

## Verification

Run `pnpm test:db` for database guard behavior and the requested repository checks (`pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`). Live Supabase application is out of scope; the migration must be applied separately before relying on the protection in production.
