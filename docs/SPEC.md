# Spec

Source of truth for screens, data model and features. Visual reference for screens: `docs/design/*.dc.html` (reference only; rebuild as React + Tailwind, do not copy markup).

## Product context

- Customers: small to mid-size clinics in the Philippines (owner, doctors, receptionist, billing).
- SaaS, multi-tenant. Every table is scoped by `clinic_id`; RLS enforces it.
- Currency PHP (integer centavos). Timezone Asia/Manila. English and Filipino.
- Privacy: RA 10173 principles (consent, minimal data, audit logs, no patient names or contact details in app logs).

## Screens

| Area               | Screen                                                                     | Design file                                                               |
| ------------------ | -------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Desktop            | Dashboard                                                                  | `Main`                                                                    |
|                    | Payments                                                                   | `Payments`                                                                |
|                    | Patients (list)                                                            | `Patients`                                                                |
|                    | Patient record                                                             | `Patient`                                                                 |
|                    | Appointments (week calendar)                                               | `Appointments`                                                            |
|                    | New appointment (modal)                                                    | `NewAppt`                                                                 |
|                    | Invoices                                                                   | `Invoices`                                                                |
|                    | New invoice                                                                | `NewInvoice`                                                              |
|                    | Invoice detail                                                             | `InvoiceDetail`                                                           |
|                    | Withdraw (modal)                                                           | `Withdraw`                                                                |
|                    | Dr. Pill inbox (conversations, live chat, "Needs a human")                 | `Ari` (options: `AriOptions`)                                             |
|                    | Integrations and MCP                                                       | `Integrations`                                                            |
|                    | Settings: Clinic profile, Staff and roles, Notifications, Dr. Pill         | `SettingsClinic`, `SettingsStaff`, `SettingsNotifications`, `SettingsAri` |
| Auth/setup         | Login / Sign up                                                            | `Login`                                                                   |
|                    | Onboarding (clinic, team, Meet Dr. Pill, payments)                         | `Onboarding`, `MeetAri`                                                   |
| Mobile PWA (390px) | Patient portal                                                             | `Portal`                                                                  |
|                    | Chat with Dr. Pill                                                         | `AriMobile`                                                               |
|                    | Collect payment                                                            | `Collect`                                                                 |
|                    | Payment received                                                           | `Success`                                                                 |
| Marketing          | Landing (hero, features, `APP_NAME Pay`, pricing with `[YOUR PRICE]`, CTA) | `Landing`                                                                 |

Navigation groups: Workspace, Money, Assistant, then Settings.

## Data model (start here, refine as needed)

All tables: `id uuid pk`, `clinic_id uuid`, `created_at`, `updated_at`, RLS policies.

- `clinics`, `memberships` (user_id, clinic_id, role: owner | doctor | receptionist | billing)
- `branches` (clinic_id, name, address, phone, lat/lng nullable, timezone). **Phase 2, before any appointment exists**, so branch scoping is never retrofitted. Every clinic gets one default branch on creation. `branch_id` goes on `clinic_hours`, doctor schedules and `appointments` (required), and optionally on `invoices`. Staff access is clinic-wide by default; per-branch restriction can be added later.
- `patients` (name, birthdate, sex, phone, email, consent_at, notes). Patients belong to the clinic, not a branch, so they can visit any branch.
- `doctors` (membership_id, specialty), `clinic_hours`
- `appointments` (patient_id, doctor_id, branch_id, starts_at, ends_at, reason, status, source: staff | ai | portal)
- `waitlist_entries` (patient_id, branch_id nullable, doctor_id nullable, reason, preferred days/times, status, consent for outreach). Phase 2 (table + UI), used by the Chair-Filler in Phase 4.
- `visits` (appointment_id, notes, vitals jsonb), `prescriptions`
- `invoices` (patient_id, number, status, due_date, total), `invoice_items`
- `payments` (invoice_id, method: gcash | maya | card | cash | bank, amount, status, provider_ref, paid_at)
- `payouts` (amount, destination, status, arrives_at)
- `conversations`, `messages` (channel: web | messenger | viber | sms | email, patient_id, handled_by: ai | human)
- `agent_actions` (kind, status: proposed | approved | executed | rejected | failed, autonomy: suggest | approve | auto, payload jsonb without patient names or contact details, outcome, recovered_centavos nullable, decided_by nullable, created_at). The single log behind "what did Dr. Pill do today" and the "recovered by Dr. Pill" figure. Phase 4.
- `agent_rules` (clinic_id, action kind, autonomy level, limits such as max messages per day and max amount). Phase 4.
- `mcp_tokens` (hashed token, scopes[], revoked_at), `audit_log` (actor, action, entity, entity_id, meta, at)

Rules:

- Money is integer centavos.
- DB functions/constraints keep `invoices.total` equal to the sum of its items.
- No double-booking: exclusion constraint on a doctor's time range.

## Features

1. **Auth and tenancy**: Supabase Auth, clinic created on sign-up, role-based access (matrix shown in Staff and roles), RLS everywhere, RLS tests.
2. **Appointments**: week calendar; create, move, cancel; open-slot generation from clinic hours and doctor availability.
3. **Patients and records**: searchable list; record page with vitals, visit history, medications, balance. Reading a record writes to `audit_log`.
4. **Invoices and payments**: draft, send, mark paid. "Request payment" creates a PayMongo payment link; a signature-verified, idempotent webhook updates payment and invoice. Cash is recorded manually.
5. **Payments hub**: balance, filterable transactions, payout schedule, withdraw flow. Real money movement is out of scope: payouts use a clearly marked mock behind a provider interface.
6. **Dr. Pill**: Claude tool-use agent. Answers FAQs from clinic data, shows open slots, books and reschedules, shares payment links. Hands off to a human for medical advice, refunds and upset patients; never answers medical questions. Starts with web chat and the mobile chat screen; Messenger adapter behind an interface.
7. **MCP server** (`/api/mcp`, streamable HTTP): per-clinic bearer tokens with scopes. Tools: `list_appointments`, `find_patient`, `get_patient_summary`, `daily_summary`, `book_appointment`, `reschedule_appointment`, `create_invoice` (draft only), `request_payment` (explicit staff approval in app). No money-sending tool. Patient-record reads off by default. Every call is written to `audit_log`.
8. **Notifications**: appointment reminders 24h before via a scheduled Supabase function. Channel-aware (SMS, Viber, Messenger, email) behind one provider interface with stubs; two-way (reply to confirm or reschedule). Marketing messages need recorded consent.
9. **Branches**: a clinic has one or more branches. Branch switcher/filter in the app shell, per-branch schedule and calendar, owner view comparing branches. Patient-facing "nearest branch with the earliest slot" on the booking page, with a map built on OpenStreetMap/MapLibre (no Google Maps cost). No map in the owner dashboard for now.
10. **Chair-Filler** (headline differentiator, Phase 4): when an appointment is cancelled or a no-show leaves a gap, Dr. Pill ranks waitlist and overdue-recall patients, offers the slot, books it on acceptance, and shares a payment or deposit link. The dashboard shows pesos recovered, computed from `agent_actions` (never estimated by the model).
11. **Autonomy levels and activity log** (Phase 4): every agent action kind runs as suggest, approve or auto, per clinic, with daily limits. Everything is written to `agent_actions`; owners see an activity feed. Defaults to approve; auto is opt-in per action kind. Outreach to patients requires recorded consent.
12. **Owner command center** (Phase 4/5): the owner asks in plain language ("why is revenue down this week?"). Dr. Pill answers only through vetted metric queries (tools), never by inventing numbers, and proposes actions the owner can approve in one tap.
13. **Channels**: web chat first. Messenger and Viber adapters in Phase 4 behind the channel interface. Constraints to design for: Messenger only allows free-form messages within 24 hours of the patient's last message (Meta app review and page permissions have lead time, so start the Meta app setup early), and proactive offers such as the Chair-Filler need SMS or Viber (paid) or opt-in recurring notifications. Assumption to validate with real clinics: most book through Messenger/Viber rather than web chat or email.

## Phases

0. Scaffold, Tailwind tokens, ui components, `/styleguide`, Supabase local config, CI. (done)
1. Auth, clinics, memberships, RLS, onboarding, app shell. (done; verified on live Supabase)
2. **Branches**, patients, doctors, appointments, calendar, New appointment, **waitlist**. (done; verified on live Supabase. Left for later: per-doctor hours editor, month view, patient import, balance and billing tab)
3. Invoices, PayMongo links and webhooks, Payments hub, Dashboard. (built and verified on live Supabase except the real PayMongo round trip, which needs keys. Left for later: editing drafts, PDF download, invoice delivery by SMS/Messenger, the "recovered by Dr. Pill" tile (Phase 4), payment-method fees.)
4. Dr. Pill. **4A (built; chat needs API keys to run live):** avatar, web chat, tools, handoff, inbox, settings, activity log. **4B (built; live accept flow needs the service-role key):** Chair-Filler (ranking, approval in Activity, private offer link, recovered estimate), owner command center. **4C:** Messenger/Viber/SMS sending, payment links in chat, identity verification (OTP) for existing-appointment changes, auto-send autonomy.
5. MCP server, tokens, permissions UI, audit log.
6. Patient portal PWA, channel-aware notifications and two-way reminders, landing, polish, e2e.

## Backlog and positioning (not scheduled)

Positioning: Dr. Pill is a supervised AI staff member that earns its keep in pesos, not a chatbot. Do not put numbers on it until measured with real clinics.

Candidate differentiators, in rough order of value:

- **Recall and unfinished treatment plans**: find patients due for cleaning/follow-up or who left a plan unfinished; personalised Taglish outreach. Likely the largest recovered revenue for dental clinics.
- **No-show prediction**: classical ML on appointment history; ask for a deposit only on high-risk bookings. Needs enough data per clinic first.
- **Marketing agent**: seasonal promos, social posts, review replies, and campaign-to-booking attribution. No review gating (against Google policy).
- **Treatment plan explainer and installment links**: explains the dentist's plan in plain Taglish after the consult; the dentist approves wording. No new medical advice.
- **Voice charting for dentists**: dictated findings become a chart or note that the dentist reviews and signs. Deepest moat, hardest to build.
- **PH compliance wedge**: HMO/LOA tracking (for example Maxicare, Intellicare) and BIR-compliant receipts.

Own AI model: deferred, not promised. Training on patient data is a new purpose under RA 10173 and needs explicit consent, de-identification and a data-processing agreement with each clinic, plus leakage review. Clinic data is small and structured, so start with small specialised models (no-show, demand forecast) and, much later, distill a small open model for Taglish FAQs from consented, de-identified conversations to cut cost. Until then the honest claim is "Dr. Pill gets better with your clinic's data" (retrieval and analytics), not "our own model".
