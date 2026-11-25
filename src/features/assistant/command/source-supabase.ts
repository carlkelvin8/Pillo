import { z } from "zod";
import { getChairFillerSummary } from "@/features/chair-filler/queries";
import { invoiceStats } from "@/features/invoices/queries";
import { addDays, todayIn, zonedToUtcIso } from "@/lib/datetime";
import { createClient } from "@/lib/supabase/server";
import type { MetricsSource } from "./metrics";

/** Metrics read as the signed-in owner, so Row Level Security applies. */
export function createSupabaseMetricsSource(clinicId: string, tz: string): MetricsSource {
  const bounds = (r: { from: string; to: string }) => ({
    start: zonedToUtcIso(r.from, "00:00", tz),
    end: zonedToUtcIso(addDays(r.to, 1), "00:00", tz),
  });
  return {
    async payments(range) {
      const { start, end } = bounds(range);
      const supabase = await createClient();
      const { data, error } = await supabase
        .from("payments")
        .select("method, amount_centavos, paid_at")
        .eq("clinic_id", clinicId)
        .eq("status", "succeeded")
        .gte("paid_at", start)
        .lt("paid_at", end)
        .limit(5000);
      if (error) throw new Error("payments");
      return z
        .array(
          z.object({ method: z.string(), amount_centavos: z.coerce.number(), paid_at: z.string() }),
        )
        .parse(data ?? [])
        .map((p) => ({ method: p.method, centavos: p.amount_centavos, paidAt: p.paid_at }));
    },
    async appointmentStatuses(range) {
      const { start, end } = bounds(range);
      const supabase = await createClient();
      const { data, error } = await supabase
        .from("appointments")
        .select("status")
        .eq("clinic_id", clinicId)
        .gte("starts_at", start)
        .lt("starts_at", end)
        .limit(5000);
      if (error) throw new Error("appointments");
      return z
        .array(z.object({ status: z.string() }))
        .parse(data ?? [])
        .map((a) => a.status);
    },
    invoices() {
      const today = todayIn(tz);
      return invoiceStats(clinicId, today, zonedToUtcIso(`${today.slice(0, 8)}01`, "00:00", tz));
    },
    chairFiller: () => getChairFillerSummary(clinicId),
  };
}
