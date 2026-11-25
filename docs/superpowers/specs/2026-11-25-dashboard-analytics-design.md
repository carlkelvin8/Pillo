# Dashboard Analytics Design

## Intent

Make the clinic dashboard easier to scan by aligning its four KPI cards and showing collections and appointment trends together.

## Goals

- Keep four KPI cards at equal width on wide screens.
- Show a 12-month collections bar chart and a 12-month appointment line chart side by side.
- Keep the charts together at medium widths by spanning the balance hero across the row; at extra-large widths, align the hero and charts in one three-card row.
- Keep chart inputs aggregate-only and clinic-timezone aware; do not select patient names or identifiers for the appointment trend.
- Preserve existing role-based visibility and dashboard links.
- Use the current design tokens and no new chart dependency.
- Give chart marks sufficient contrast against the card surface.

## Non-goals

- No changes to billing calculations, appointment workflows, or database schema.
- No interactive chart filtering or export.

## Approaches

1. Use two financial charts (monthly and daily collections): no new query, but both visuals describe the same clinic activity.
2. Pair the existing monthly collections bars with a monthly appointment trend: adds one small server query but gives owners a view of both cash flow and clinic workload. **Chosen** because the dashboard already surfaces both finance and scheduling KPIs.
3. Add a chart library: richer interactions, but unnecessary for two static, accessible dashboard charts and increases bundle size.

## Design

At extra-large widths, align the existing balance hero and both charts in a three-card row. At medium widths, span the balance hero across the row and place the charts together below it; stack them on small screens. Keep the four KPI cards in a four-column grid on wide screens (two columns at medium widths, one on small screens). The appointment query selects only appointment start timestamps from the first displayed month through the start of the next month, so the current month includes upcoming bookings; group by clinic-local month in server code. Each graph includes an accessible text/table equivalent, and positive bars use the high-contrast mint-ink token.

## Constraints

- No new dependencies or migrations.
- Continue formatting money through `src/lib/money.ts` and dates through `src/lib/datetime.ts`.
- Respect `payments.manage`, `invoices.create`, `schedule.view`, and `staff.manage` visibility.
- Use CSS design tokens; do not hard-code colors in TSX.
