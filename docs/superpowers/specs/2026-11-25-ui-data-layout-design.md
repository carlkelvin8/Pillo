# Data Visibility and Card Layout Design

## Intent

Make the dashboard, appointments, patients, payments, and invoice views easier to scan as the QA clinic accumulates records.

## Goals

- Keep dashboard collection and appointment charts grounded in real aggregates; show month-over-month change without counting pending payments as collections.
- Keep doctor and waitlist cards from growing with their lists by scrolling their contents inside bounded panels.
- Show useful patient demographics and contact details in the list and limit the server-paginated list to 10 rows.
- Align the invoice receipt and payment views with consistent card spacing and clear payment details.

## Non-goals

- Do not fabricate successful payments or alter production financial data.
- Do not change database schema, RLS, or payment calculations.
- Do not add a charting dependency.

## Approach

Reuse current aggregate queries, show a truthful comparison to the preceding month, and improve the existing server-rendered cards. A synthetic chart series would make collections misleading; pending test invoices remain outstanding until a real or explicitly recorded payment occurs.

## Design

Dashboard chart cards gain a compact delta label against the previous month. Appointments side panels keep their current card design with bounded, independently scrollable lists. Patient rows show birthdate, age/sex, phone, email, and a clear link to the full record; pagination remains server-side at 10 rows. The paid invoice detail state gets a receipt summary using the existing succeeded payment rows, and invoice/payment cards use matching top alignment and spacing.

## Constraints

- Keep money in integer centavos and render only with `src/lib/money.ts`.
- Keep clinic timezone conversions in `src/lib/datetime.ts`.
- Use existing permission checks and Supabase queries.
- Do not change files under `docs/design/` or commit.
