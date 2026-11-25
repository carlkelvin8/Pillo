# Phase 5 MCP design

## Intent

Give each clinic owner a way to issue and revoke scoped bearer tokens for external MCP clients. Expose the Phase 5 tools from `/api/mcp`, keep patient data access opt-in, and log each authenticated tool call without storing patient names, contact data, or bearer tokens in audit metadata.

## Goals

- Implement a stateless Streamable HTTP MCP endpoint at `/api/mcp`.
- Let owners create, list, and revoke clinic-scoped tokens. Show a new token only once; persist only its SHA-256 hash.
- Support scopes for appointment reads/writes, patient lookup/summary, daily aggregates, draft invoice creation, and payment requests.
- Keep patient reads off by default and expose no money-sending tool.
- Make `request_payment` create a proposed activity item. A staff member must approve it in the app before the existing payment-link flow runs.
- Record every authenticated tool call in `audit_log` with tool name and outcome only.

## Non-goals

- OAuth authorization-code flows, token expiry/rotation automation, webhook delivery, outgoing patient messaging, and direct payment execution from MCP.
- Applying migrations to live Supabase as part of implementation.

## Constraints

- Follow `CLAUDE.md`: MCP server-side database work uses Drizzle and always includes explicit `clinic_id` predicates; tenant tables get RLS, column grants, and database tests.
- Keep the service-role key and database URL server-only.
- Preserve Supabase and database invariants for appointments, invoices, payments, and audit records.
- Patient names, phone numbers, email addresses, access tokens, and clinical notes never enter audit metadata or application logs.
- `request_payment` creates a staff approval request only; approval happens in the authenticated app and then uses the existing provider flow.

## Approaches

1. **Use the existing `agent_actions` activity log for payment requests (selected).** Store a proposed MCP request with only token, invoice, and amount identifiers; extend Activity with approve/reject controls. This reuses the existing staff-facing review area and keeps the MCP request from creating a payment link.
2. **Create a separate payment-request table and inbox.** This gives the flow a focused data model but duplicates approval state and requires a second staff queue. It is unnecessary for this phase.

For the endpoint, use the official MCP TypeScript SDK's stateless Streamable HTTP handler because each request can authenticate independently with a bearer token and the app does not need server-held MCP session state. Use the current maintained SDK package exports after confirming their API during implementation.

## Token scopes

- `appointments:read` → `list_appointments`
- `patients:read` → `find_patient`, `get_patient_summary` (off by default)
- `daily_summary:read` → `daily_summary`
- `appointments:write` → `book_appointment`, `reschedule_appointment`
- `invoices:write` → `create_invoice` (draft only)
- `payments:request` → `request_payment` (proposes staff approval only)

New tokens start with no scopes selected. The owner grants only the scopes needed for a specific client. Tool inputs are Zod-validated, date ranges are bounded, result sizes are capped, and every database query is tenant-filtered using the clinic id bound to the token.

## Data and access design

- Add `public.mcp_tokens` with `clinic_id`, display name, token hash, scope array, creator, created/last-used timestamps, and revocation timestamp. RLS and policies limit management to clinic owners. Authenticated clients may read non-secret columns and revoke tokens, but can never read `token_hash`.
- Add a server-only token validator that hashes the supplied bearer token and looks up an active record. Reject missing, invalid, or revoked tokens before MCP dispatch.
- Add owner-only token management UI to the existing Integrations page. Show the raw token only in the successful creation response and require the owner to copy it before leaving that state.
- Use Drizzle with `DATABASE_URL` for MCP access. Add that server-only variable to env validation/example if not already defined. The local env currently has no database URL, so live database-backed MCP calls cannot be exercised until the owner configures it.
- Authenticated tool calls write an audit row with `actor_type = 'mcp'`, action `mcp.tool_called`, entity `mcp_token`, token id, and metadata limited to `{ tool, outcome }`. Failed authentication cannot be attributed to a clinic and is not written to a tenant audit log.
- Extend `agent_actions` for `mcp_request_payment` proposals with a constrained owner/receptionist approval/rejection path. Store identifiers and non-personal facts only. On approval, the authenticated action uses the existing payment link action/provider and records completion/failure; the MCP endpoint itself never creates or sends the link.

## Tools

- `list_appointments`: bounded clinic-local date range, optional doctor/branch, capped result set; return schedule facts and identifiers.
- `find_patient`: scoped text search, bounded results, requires `patients:read`.
- `get_patient_summary`: demographics and existing appointment summary only; no visit notes or prescriptions in Phase 5; requires `patients:read`.
- `daily_summary`: bounded date range and aggregate counts/totals only.
- `book_appointment`: validate patient, doctor, branch, duration and slot availability; insert as a server-originated appointment while relying on the database no-double-booking constraint.
- `reschedule_appointment`: validate availability and preserve appointment ownership/tenant checks.
- `create_invoice`: validate items and dates, create a draft using existing derived-total rules; never accept totals or payment status from the caller.
- `request_payment`: verify invoice and amount due, create a proposed `agent_actions` request, return a request id and state that staff approval is required. No link is created by this tool.

## Verification

- Unit tests cover bearer parsing/hash lookup, revocation, scope enforcement, tool validation, audit metadata redaction, and payment request proposal behavior.
- Database tests cover token tenant isolation, owner-only token management, secret-column denial, scope persistence, revocation, proposal visibility/approval authorization, and audit behavior.
- MCP protocol tests call the in-process SDK handler for initialize, tools/list, authorized calls, and denied calls.
- Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:db`, and `pnpm build`.
- Live Supabase, external MCP client, and provider round trips remain unverified unless a live database URL and provider keys are configured. Do not apply a migration to live Supabase without a separate request.

## Builder calls

- Use one `patients:read` scope for both patient search and summary; this avoids exposing searchable identifying data under a separate default permission.
- Keep clinical notes and prescriptions out of the first MCP release.
- Reuse `agent_actions` for payment approval state; add narrowly constrained database permissions and tests for staff decisions.
- Add `/api/mcp` to the public middleware allowlist, then authenticate every request in the route using its bearer token.
- Use existing appointment and invoice schemas for write validation; define bounded date ranges and result counts in the MCP tool schemas.
- Write audit entries for authenticated tool failures as well as successful calls, with only the tool name and outcome in metadata.
