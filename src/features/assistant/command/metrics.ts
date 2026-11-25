import type { ModelTool } from "@/features/assistant/agent/model";
import { z } from "zod";
import { addDays, dateOf } from "@/lib/datetime";
import { formatPHP } from "@/lib/money";

/** Read-only business numbers for the owner. Aggregates only: no patient names or contact details. */
export type MetricsSource = {
  /** Succeeded payments in [from, to] (clinic-local dates, inclusive). */
  payments(range: Range): Promise<{ method: string; centavos: number; paidAt: string }[]>;
  /** Appointment statuses with a start time in [from, to]. */
  appointmentStatuses(range: Range): Promise<string[]>;
  invoices(): Promise<{
    open: { centavos: number; count: number };
    overdue: { centavos: number; count: number };
    paidThisMonth: { centavos: number; count: number };
  }>;
  chairFiller(): Promise<{
    filled: number;
    kept: number;
    avgVisitCentavos: number | null;
    recoveredCentavos: number | null;
  }>;
};
export type Range = { from: string; to: string };

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");
export const rangeSchema = z
  .object({ from: date, to: date })
  .refine((r) => r.from <= r.to, "from must be on or before to")
  .refine((r) => addDays(r.from, 366) >= r.to, "Range is limited to 366 days");

const rangeProps = {
  type: "object" as const,
  properties: {
    from: { type: "string", description: "Start date, clinic-local, YYYY-MM-DD (inclusive)" },
    to: { type: "string", description: "End date, clinic-local, YYYY-MM-DD (inclusive)" },
  },
  required: ["from", "to"],
};

export const metricTools: ModelTool[] = [
  {
    name: "get_revenue",
    description:
      "Money collected (succeeded payments, including cash and bank entries) in a date range, with totals by payment method and by day (or by month for ranges over 62 days).",
    parameters: rangeProps,
  },
  {
    name: "get_appointment_stats",
    description:
      "Appointment counts by status in a date range, plus the no-show rate (no_show / (completed + no_show)).",
    parameters: rangeProps,
  },
  {
    name: "get_invoice_overview",
    description: "Open and overdue invoice totals, and what was paid this month.",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "get_chair_filler_summary",
    description:
      "Slots filled from cancellations, how many visits were kept, and the ESTIMATED pesos recovered (kept visits x the typical visit value the owner entered).",
    parameters: { type: "object", properties: {} },
  },
];

const money = (centavos: number) => ({ centavos, pesos: formatPHP(centavos) });
const sumBy = (rows: { key: string; centavos: number }[]) => {
  const m = new Map<string, number>();
  for (const r of rows) m.set(r.key, (m.get(r.key) ?? 0) + r.centavos);
  return Object.fromEntries(
    [...m].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, money(v)]),
  );
};

export type MetricResult = { content: string; isError: boolean };
const ok = (d: unknown): MetricResult => ({ content: JSON.stringify(d), isError: false });
const fail = (m: string): MetricResult => ({
  content: JSON.stringify({ error: m }),
  isError: true,
});

export async function executeMetricTool(
  name: string,
  input: unknown,
  ctx: { source: MetricsSource; tz: string },
): Promise<MetricResult> {
  try {
    if (name === "get_revenue" || name === "get_appointment_stats") {
      const r = rangeSchema.safeParse(input);
      if (!r.success) return fail(r.error.issues[0]?.message ?? "Invalid date range");
      if (name === "get_revenue") {
        const rows = await ctx.source.payments(r.data);
        const long = addDays(r.data.from, 62) < r.data.to;
        return ok({
          range: r.data,
          total: money(rows.reduce((a, p) => a + p.centavos, 0)),
          paymentCount: rows.length,
          byMethod: sumBy(rows.map((p) => ({ key: p.method, centavos: p.centavos }))),
          [long ? "byMonth" : "byDay"]: sumBy(
            rows.map((p) => ({
              key: dateOf(p.paidAt, ctx.tz).slice(0, long ? 7 : 10),
              centavos: p.centavos,
            })),
          ),
        });
      }
      const statuses = await ctx.source.appointmentStatuses(r.data);
      const by: Record<string, number> = {};
      for (const s of statuses) by[s] = (by[s] ?? 0) + 1;
      const denom = (by.completed ?? 0) + (by.no_show ?? 0);
      return ok({
        range: r.data,
        total: statuses.length,
        byStatus: by,
        noShowRate: denom === 0 ? null : Math.round(((by.no_show ?? 0) / denom) * 1000) / 10,
        noShowRateUnit: "percent",
      });
    }
    if (name === "get_invoice_overview") {
      const i = await ctx.source.invoices();
      return ok({
        open: { ...money(i.open.centavos), count: i.open.count },
        overdue: { ...money(i.overdue.centavos), count: i.overdue.count },
        paidThisMonth: { ...money(i.paidThisMonth.centavos), count: i.paidThisMonth.count },
      });
    }
    if (name === "get_chair_filler_summary") {
      const c = await ctx.source.chairFiller();
      return ok({
        slotsFilled: c.filled,
        visitsKept: c.kept,
        typicalVisitValue: c.avgVisitCentavos === null ? null : money(c.avgVisitCentavos),
        estimatedRecovered: c.recoveredCentavos === null ? null : money(c.recoveredCentavos),
        note: "Estimate only: kept visits x the owner's typical visit value.",
      });
    }
    return fail(`Unknown tool: ${name}`);
  } catch {
    return fail("That number could not be loaded right now.");
  }
}
