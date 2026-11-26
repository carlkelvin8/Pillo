# Clinic SaaS (Philippines)

Multi-tenant clinic management SaaS: appointments, patient records, invoicing, a banking-style payments hub, an AI receptionist (Dr. Pill) and an MCP server. Everything is one Next.js app. See `docs/SPEC.md` for screens, data model and features.

## Product name and brand assets

The product is **Pillo**. The name lives in one constant: `APP_NAME` in `src/config/brand.ts`. Use it everywhere the name appears (titles, emails, logo text). Never hard-code a name. The payments label is `APP_PAY_LABEL` (`${APP_NAME} Pay`). The design files in `docs/design/` still say "Meridian" and a few "Ari": both are placeholders from an earlier draft. Replace with `APP_NAME` / "Dr. Pill". Logo files are in `public/brand/` (wordmark, mark, app icons); `src/app/icon.svg` and `apple-icon.png` are the favicons; `public/icons/` holds the 192/512 PWA icons for Phase 6. The `Logo` component draws the app icon inline with tokens; use `wordmark-*.svg` for marketing pages.

## Stack (fixed)

- Next.js 15 (App Router, Server Components, Server Actions), TypeScript strict
- Supabase: Postgres, Auth, RLS, Storage, Realtime, Edge Functions
- Tailwind CSS v4 + shadcn-style components (`radix-ui`), restyled to the tokens below
- Drizzle ORM (types and queries) + Supabase migrations in `supabase/migrations`
- Zod for all validation; TanStack Query only for realtime or optimistic UI
- PayMongo (GCash, Maya, cards) via payment links and webhooks, plain `fetch`
- Claude API (Anthropic SDK, tool use) for Dr. Pill
- `@modelcontextprotocol/sdk` for the MCP server (streamable HTTP at `/api/mcp`)
- Vitest (unit), Playwright (3 critical e2e flows)
- pnpm, ESLint, Prettier. No Python, no separate backend.

Pinned on purpose: `typescript@5.9` (typescript-eslint does not support TS 7 yet).

## Commands

```bash
pnpm dev          # next dev --turbopack
pnpm lint         # eslint (also bans hard-coded hex colors in TSX)
pnpm typecheck    # tsc --noEmit
pnpm test         # vitest
pnpm build
pnpm test:db       # RLS tests (throwaway Postgres)
pnpm e2e          # playwright (phase 6)
```

CI (`.github/workflows/ci.yml`) runs lint, typecheck, test and build.

## Design tokens (match exactly)

Tokens live in `src/app/globals.css` under `@theme`. Use the Tailwind classes (`bg-ink`, `text-muted`, `border-line`, `bg-mint`...). Never write hex in components (ESLint enforces it).

| Token                         | Value                             | Use                                                                                        |
| ----------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------ |
| ink                           | `#0A0A0A`                         | text, primary button, hero card                                                            |
| canvas                        | `#F5F5F2`                         | page background                                                                            |
| surface                       | `#FFFFFF`                         | cards, sidebar                                                                             |
| line                          | `#E8E8E4`                         | card borders                                                                               |
| line-strong                   | `#DCDCD6`                         | ghost button / input border                                                                |
| muted                         | `#66665F`                         | secondary text                                                                             |
| ink-2 / subtle / faint        | `#4A4A45` / `#F0F0EC` / `#A8A8A0` | derived from the design files. `faint` is decorative or on ink only (fails 4.5:1 on white) |
| mint / mint-strong / mint-ink | `#D6F0E0` / `#86D8AB` / `#0A5C38` | success, brand                                                                             |
| amber-chip(-ink)              | `#FBEFD2` / `#7A5200`             | Pending                                                                                    |
| danger-chip(-ink)             | `#FADDD9` / `#8F2A1F`             | Overdue                                                                                    |
| neutral-chip                  | `#EFEFEA`                         | neutral                                                                                    |
| blush                         | `#F7B7AE`                         | mascot only                                                                                |

- Font: Plus Jakarta Sans 400/500/600/700 self-hosted via `@fontsource-variable/plus-jakarta-sans` (no build-time network). Numbers and money use `tabular` (tabular figures).
- Page title: `text-title` (40px/600, -0.03em). Card title: `text-card-title` (18px/600).
- Cards: white, 1px line, `rounded-card` (20px), `shadow-card`. Hero balance card: `Card variant="hero"` (ink, 24px).
- Buttons: `rounded-control` (12px), min height 44px. Primary = ink on white, ghost = 1px line-strong, mint = positive.
- Chips are pills: Paid/Success mint, Pending amber, Overdue danger, neutral. Use `statusTone` to map statuses.
- Layout: 256px white sidebar (groups: Workspace, Money, Assistant, then Settings), top bar with search and notifications. Page padding 48px, 32px between sections, 24px between cards.
- Touch targets at least 44px. Text must pass 4.5:1. Real `<button>`, `<a>`, `<label>`. Respect `prefers-reduced-motion` (handled globally).
- Live reference: `/styleguide`.

## Mascot: Dr. Pill

The AI receptionist. Genderless chibi capsule: mint top, white bottom, big glossy eyes, blush, stethoscope, thick ink outline. Component: `<DrPillAvatar mood="happy | wink | think | sleepy" size />` in `src/components/brand/`. `think` = loading, `sleepy` = after hours. Use in chat, onboarding, empty states and login. Data values use `ai` (not `ari`, not `drpill`) so renaming the assistant never touches data: `source: staff | ai | portal`, `handled_by: ai | human`.

## Architecture (Phase 1)

- **Data access:** user-facing reads/writes go through `supabase-js` as the signed-in user (`src/lib/supabase/server.ts`), so RLS always applies. Rows are validated with Zod (`*.schemas.ts`, `queries.ts`). Drizzle is reserved for server-only work that has no user session (webhooks, MCP, scheduled jobs) and arrives with the first such feature; there, always pass `clinic_id` explicitly. Never use the service-role key in request handlers that act for a user.
- **Migrations:** hand-written SQL in `supabase/migrations` is the source of truth (RLS and functions included). Every new tenant table needs `clinic_id`, RLS, per-column grants, and tests in `tests/db/`.
- **Tenancy:** `clinic_id` is derived from the user's membership in `getWorkspace()` (`src/features/auth/workspace.ts`), never from client input. A user can belong to several clinics; the oldest membership is active until a switcher exists. Policy helpers: `private.is_member`, `private.has_role`. Clients cannot insert into `clinics`, `memberships` or `audit_log`: use `create_clinic()`, `accept_pending_invitations()`, `log_audit()` (`logAudit()` in `src/features/audit/log.ts`). `audit_log.meta` never holds patient names or contact details.
- **Permissions:** the matrix lives in `src/features/auth/permissions.ts` (UI) and must stay in step with RLS (the enforcement). Pages call `requireCapability(...)`; actions check `can(...)` and RLS backs them up.
- **Auth flow:** sign-up -> email confirmation (`/auth/callback`) -> onboarding creates the clinic -> app. Middleware (`src/middleware.ts`) is default-deny: add public routes to its allowlist explicitly (webhooks, MCP, portal in later phases).
- **Server Actions:** `(prev, formData) => ActionState` with `useActionState`; Zod-validate, return `fieldErrors`, echo non-sensitive `values` (never passwords). Generic errors for auth (no account enumeration).
- **Routes:** groups `(auth)`, `(onboarding)`, `(app)` (guarded shell). Screens from later phases are `PagePlaceholder`s.

## Scheduling (Phase 2)

- **Branches:** every clinic has at least one branch (`create_clinic()` makes "Main branch"). `branch_id` is required on appointments and hours. Opening hours are per branch (`clinic_hours`); optional per-doctor windows (`doctor_hours`): no rows = available whenever the branch is open, rows = only those windows.
- **Cross-tenant integrity:** child tables reference parents with composite `(clinic_id, id)` foreign keys, so a row can never point at another clinic's patient, doctor or branch.
- **No double-booking** is enforced by the database (`appointments_no_double_booking` exclusion constraint; cancelled and no-show free the slot). The app also checks open slots first (`src/features/scheduling/slots.ts`), and maps error `23P01` to "That time is no longer available".
- **Access:** patients (directory) are readable by all members, writable by owner/doctor/receptionist. `visits` and `prescriptions` (clinical) are owner/doctor only; `patients` holds demographics only (no notes column). Opening a patient record writes `patient.viewed` to `audit_log`.
- **Clients cannot create AI or portal appointments** (RLS requires `source = 'staff'`); Dr. Pill and the portal book from server code in later phases.
- **Time:** dates are clinic-local "YYYY-MM-DD" strings, timestamps are UTC; convert only through `src/lib/datetime.ts` (clinic timezone).
- **Dev gotcha:** after changing server code, restart `pnpm dev` if a page seems to show stale data (the dev server caches fetches across hot reloads).
- **Next.js memoizes identical GET fetches within a render.** When you must re-run the same Supabase query after a mutation in the same request, change the query text (see `getWorkspace`).
- Always filter membership lookups by `user_id`: RLS lets members see every membership in their clinic.

## Billing and payments (Phase 3)

- **Money is integer centavos (bigint).** Clients can never write invoice totals: triggers derive `subtotal`/`total` and the `invoices_total_matches` CHECK proves it. Only draft invoices are editable; `paid` is set only by the payment trigger. Create invoices through `create_invoice()` (atomic, runs with the caller's rights).
- **Provider payments:** a payment becomes `succeeded` only through `apply_provider_payment()` (service role only): idempotent per `(provider, event_id)`, refuses amount mismatches and unknown links, and records an audit entry. Clients can only create pending links or manual cash/bank payments, and can only cancel a pending link.
- **PayMongo:** `src/features/payments/` has the provider interface, the link client, and webhook signature verification (HMAC-SHA256 of `t.rawBody`, 5-minute tolerance). The webhook route `/api/webhooks/paymongo` verifies on the RAW body before parsing, never logs the body, and uses the service-role client (`src/lib/supabase/service.ts`, the only place that bypasses RLS). The link description is just the invoice number: no patient data goes to the provider.
- **Local development:** set `ONLINE_PAYMENTS_ENABLED=true`, `PAYMENTS_MODE=mock` (ignored in production) and `SUPABASE_SERVICE_ROLE_KEY` to get fake links at `/pay/mock/<ref>` that run the same webhook processing. Real PayMongo needs `PAYMONGO_SECRET_KEY`, `PAYMONGO_WEBHOOK_SECRET` and a public URL for the webhook.
- **Record-only mode (current):** Pillo is a payment logbook until the business is registered with PayMongo. `onlinePaymentsEnabled()` (`src/config/features.ts`, env `ONLINE_PAYMENTS_ENABLED=true`) gates payment links; off by default, `requestPaymentAction` refuses and the UI shows "Online payments: coming soon" (GCash, QR Ph, Maya, cards). Staff record cash, bank, GCash or Maya received outside Pillo with a date (RLS allows manual `cash/bank/gcash/maya` only); recording also cancels a legacy pending link. The dashboard and `/payments` show "Recorded this month" instead of a balance.
- **Clinic logo:** owners upload a PNG/JPG/WebP (≤1 MB, content-sniffed, no SVG) in Settings > Clinic profile to the public `clinic-logos` bucket (`<clinic_id>/logo-*.ext`, owner-only write policies); `clinics.logo_path` replaces the sidebar letter badge.
- **Payouts are a DEMO** (`is_mock = true`): `request_payout()` checks the balance atomically but moves no money. The destination is only a label (last 4 digits); the form rejects long numbers. There is no money-sending anywhere else.
- **Balance** = succeeded online (non-manual) payments minus payouts. Cash and bank transfers recorded by hand are collections but not part of the balance.

## Dr. Pill (Phase 4A)

- **Agent:** `src/features/assistant/agent/` uses Pillo-owned provider-neutral model messages (`model.ts`) and a manually executed tool loop (`run.ts`). The Gemini adapter uses `gemini-3.8-flash` by default, configurable with `GEMINI_MODEL`. Tools (`tools.ts`): `get_clinic_info`, `list_open_slots`, `book_appointment`, `reschedule_appointment`, `request_human`. Which tools exist depends on the clinic's switches. Every tool input is Zod-validated and failures return tool errors, never exceptions.
- **Gemini boundary:** `pnpm ai:demo` is a local synthetic-data demo only. It allows three fixed fixture questions about Demo Family Dental and never reads Supabase. Set `GEMINI_API_KEY` in `.env.local`; optional `GEMINI_MODEL` defaults to `gemini-3.8-flash`. Do not put clinic, patient, or owner data in Gemini Free prompts. Live `/chat` and `/dr-pill/ask` AI calls remain disabled: they run only when `LIVE_AI_ENABLED=true` (and a key is set), which stays off until the privacy decision is made.
- **Tenant safety:** the model never supplies a clinic id. `AgentStore` is built for ONE clinic and ONE conversation (`store-supabase.ts` uses the service-role client and filters every query by that clinic). Rescheduling is limited to appointments booked in the same conversation.
- **Safety order in `handleTurn`:** save the message, honor a human takeover (no model call), deterministic emergency check (`emergency.ts`, replies with 911 guidance and hands over without the model), per-clinic daily reply cap, then the model. Medical advice, refunds and upset patients go to `request_human`; this relies on the prompt (`prompt.ts`), so review real conversations before relying on it.
- **Public chat:** `/chat/<slug>` and `/api/chat/<slug>/*` need no login. A random per-conversation token (only its SHA-256 hash is stored; the column is unreadable to clients) authorizes later calls. Rate limits (`src/lib/rate-limit.ts`) are best-effort per instance. The AI response flow is paused; Gemini Free must not process live clinic or patient information.
- **Log:** `agent_actions` is the activity log (ids only, no names or message text). Staff reply in `/dr-pill`; "Hand back to Dr. Pill" returns the chat to the agent.
- **Known limits (4A):** patients are not identity-verified (no OTP), so Dr. Pill cannot look up or change existing appointments, and payment links are not offered yet. Refusals hand over to staff instead of using the server-side fallback beta.

## Chair-Filler and owner command center (Phase 4B)

- **Flow:** cancel or no-show (`setAppointmentStatusAction`) -> `proposeOffers` (`src/features/chair-filler/propose.ts`, runs as the user, never throws) drafts up to 3 `slot_offers` as `proposed` -> staff approve in Dr. Pill > Activity (`approveOfferAction`: private token, only its SHA-256 is stored, expires in 3h or 30 min before the slot) -> staff copy the Taglish message and send it themselves (no sending provider yet) -> the patient opens `/offer/<token>` (public, noindex, no-referrer) -> `acceptOffer` (`accept.ts`, service role) claims the offer atomically, re-checks the slot, books with `source = 'ai'`, marks the waitlist entry booked, expires sibling offers and logs to `agent_actions`.
- **Who is offered a slot** (`rank.ts`, tested): waiting, `outreach_ok`, patient `consent_at` set, branch/doctor/weekday/time fit, free at that time, not the patient who cancelled, slot at least 2h away, oldest first, max 3, one offer per patient.
- **Limits:** `agent_rules` kind `chair_filler` (default 10 offers/day, always approve level; there is no auto-send). Clients can only insert/approve/skip offers; accepting, declining and expiring are server-only (RLS and column grants). `token_hash` is never selectable.
- **Recovered estimate:** completed appointments that filled an accepted offer x `clinics.avg_visit_value_centavos` (owner-entered, Settings > Dr. Pill). Always labelled an estimate; hidden until a value is set. Never computed by the model.
- **Command center** (`/dr-pill/ask`, owner only, `src/features/assistant/command/`): read-only aggregate tools remain available in code, but model questions are paused until a provider/privacy decision permits live clinic data processing. Gemini Free must not receive clinic metrics.
- **Needs `SUPABASE_SERVICE_ROLE_KEY`:** the `/offer/<token>` page (shows "not available yet" without it). The accept path is covered by unit tests with a scripted client, not yet exercised live.
- **Not built (4C):** Messenger/Viber/SMS sending, OTP identity verification, payment links in chat, auto-send autonomy.

## Testing

```bash
pnpm test      # unit (vitest, jsdom)
pnpm test:db   # RLS tests on a throwaway local Postgres (needs postgres/initdb on PATH; no Docker)
```

**QA login accounts:** run `pnpm seed:qa --yes` (idempotent, dev/QA project only; it refuses a non-local Supabase host unless `QA_SEED_ALLOW_HOST` in `.env.local` equals that host). It creates or repairs `qa.owner1@`, `qa.recep1@`, `qa.doc1@example.com` (owner, receptionist, doctor) and a QA clinic. The shared password is `QA_SEED_PASSWORD` in the gitignored `.env.local`. Never ask the user for it or create new test accounts: re-run the seeder. Sample data: `scripts/seed-qa-dashboard-trends.sql`.

`tests/db/supabase-stub.sql` stands in for Supabase's `auth` schema and roles. Once Docker/Supabase local runs, also run the migrations there (`supabase db reset`).

## Rules

- Never commit secrets. `.env.example` lists variables. The Supabase service-role key is server-only.
- Validate with Zod on every Server Action and route. Never trust the client for `clinic_id`: derive it from the session/membership.
- No `any`. Small named components. Feature code under `src/features/<name>`.
- Money is integer centavos (`src/lib/money.ts`). Timezone Asia/Manila. Languages: English and Filipino (Taglish in Dr. Pill).
- Medical data, RA 10173 principles: consent, minimal data, audit log on record reads, no patient names or contact details in application logs.
- Dr. Pill never answers medical questions; it hands off to a human for medical advice, refunds and upset patients.
- MCP connects through `DATABASE_URL_MCP` as the limited `pillo_mcp` role (no DELETE/DDL, column-level grants only; enable it once with `alter role pillo_mcp login password '...'`; required in production, dev falls back to `DATABASE_URL`). Tokens expire (30 days, 90 days or 1 year; DB cap 366 days) and the auth query rejects expired ones. Tests: `tests/db/mcp-runtime-role.test.ts`.
- MCP has no money-sending tool. `request_payment` needs explicit staff approval in the app. Reading patient records is off by default. Every call goes to `audit_log`.
- Use placeholders like `[YOUR EMAIL]`, `[YOUR PRICE]` for unknown business details. Do not invent facts, prices or statistics.
- If a requirement is ambiguous or risky (money, medical data), stop and ask.

## Product direction

Selling point: Dr. Pill is a supervised AI agent that recovers revenue and runs operations, not a chatbot. Headline feature is the **Chair-Filler** (cancellation or no-show -> offer the slot to waitlist and recall patients -> book -> payment link -> "pesos recovered" on the dashboard). Full detail, backlog and the own-model stance are in `docs/SPEC.md`. Rules that follow from it:

- **Branches from the start:** a clinic has branches; `branch_id` is required on appointments and schedules. Add it in Phase 2 before any appointment data exists.
- **Autonomy levels:** every agent action is suggest, approve or auto (default approve), has daily limits, and is logged in `agent_actions`. Pesos-recovered figures come from that log, never from the model.
- **No invented numbers:** the agent answers business questions only through vetted metric tools.
- **Outreach needs recorded consent.** Messenger free-form replies only within 24 hours; proactive offers go via SMS/Viber/opt-in channels.
- **Do not claim "our own AI model"** in product copy. Say it improves with the clinic's data.

## Phases

0 Scaffold and design system, 1 Auth/tenancy/RLS/onboarding/shell, 2 Branches/patients/appointments/waitlist, 3 Invoices/PayMongo/Payments hub/Dashboard, 4 Dr. Pill (+ Chair-Filler, autonomy, activity log, command center, Messenger/Viber), 5 MCP, 6 Portal PWA/notifications/landing/e2e. Finish and verify each phase before the next.
