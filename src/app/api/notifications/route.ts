import { NextResponse } from "next/server";
import { getWorkspace } from "@/features/auth/workspace";
import { can } from "@/features/auth/permissions";
import {
  buildNotificationItems,
  totalCount,
  type NotificationCounts,
} from "@/features/notifications/items";
import { dayBoundsUtc, todayIn } from "@/lib/datetime";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** In-app alerts for the signed-in user's clinic. Counts only, read as the user so RLS applies. */
export async function GET() {
  const ws = await getWorkspace();
  if (!ws?.membership) return NextResponse.json({ items: [], total: 0 }, { status: 401 });
  const { role, clinic } = ws.membership;
  const supabase = await createClient();
  const tz = clinic.timezone;
  const today = todayIn(tz);
  const { start, end } = dayBoundsUtc(today, tz);

  const count = async (q: PromiseLike<{ count: number | null; error: unknown }>) => {
    const { count: n, error } = await q;
    return error ? 0 : (n ?? 0);
  };
  const head = { count: "exact", head: true } as const;
  const inbox = can(role, "inbox.view");

  const [needsHuman, proposedOffers, overdueInvoices, unconfirmedToday] = await Promise.all([
    inbox
      ? count(
          supabase
            .from("conversations")
            .select("id", head)
            .eq("clinic_id", clinic.id)
            .eq("status", "needs_human"),
        )
      : 0,
    inbox
      ? count(
          supabase
            .from("slot_offers")
            .select("id", head)
            .eq("clinic_id", clinic.id)
            .eq("status", "proposed"),
        )
      : 0,
    can(role, "invoices.create")
      ? count(
          supabase
            .from("invoices")
            .select("id", head)
            .eq("clinic_id", clinic.id)
            .eq("status", "sent")
            .lt("due_on", today),
        )
      : 0,
    can(role, "schedule.view")
      ? count(
          supabase
            .from("appointments")
            .select("id", head)
            .eq("clinic_id", clinic.id)
            .eq("status", "scheduled")
            .gte("starts_at", start)
            .lt("starts_at", end),
        )
      : 0,
  ]);

  const counts: NotificationCounts = {
    needsHuman,
    proposedOffers,
    overdueInvoices,
    unconfirmedToday,
  };
  const items = buildNotificationItems(role, counts);
  return NextResponse.json(
    { items, total: totalCount(items) },
    { headers: { "Cache-Control": "no-store" } },
  );
}
