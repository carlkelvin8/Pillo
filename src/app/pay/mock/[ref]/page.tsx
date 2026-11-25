import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { mockPaymentsEnabled } from "@/features/payments/provider";
import { createServiceClient } from "@/lib/supabase/service";
import { serverEnv } from "@/lib/env-server";
import { formatPHP } from "@/lib/money";
import { randomUUID } from "node:crypto";

export const metadata = { title: "Mock checkout (development)" };

async function simulatePayment(formData: FormData) {
  "use server";
  if (!mockPaymentsEnabled()) return;
  const ref = String(formData.get("ref") ?? "");
  if (!/^mock_[0-9a-f-]{36}$/.test(ref)) return;
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("payments")
    .select("amount_centavos")
    .eq("provider", "mock")
    .eq("provider_ref", ref)
    .maybeSingle();
  if (!data) return;
  await supabase.rpc("apply_provider_payment", {
    p_provider: "mock",
    p_event_id: `mock_evt_${randomUUID()}`,
    p_event_type: "mock.paid",
    p_provider_ref: ref,
    p_method: "gcash",
    p_amount_centavos: (data as { amount_centavos: number }).amount_centavos,
    p_reference: `MOCK-${ref.slice(5, 13).toUpperCase()}`,
    p_paid_at: new Date().toISOString(),
  });
}

/** DEVELOPMENT ONLY. Pretends to be the payer's checkout so the whole payment flow can be tried without PayMongo. */
export default async function MockCheckoutPage({ params }: { params: Promise<{ ref: string }> }) {
  if (!mockPaymentsEnabled()) notFound();
  const { ref } = await params;
  if (!/^mock_[0-9a-f-]{36}$/.test(ref)) notFound();
  const hasKey = Boolean(serverEnv().SUPABASE_SERVICE_ROLE_KEY);
  let amount: number | null = null;
  let status = "";
  if (hasKey) {
    const { data } = await createServiceClient()
      .from("payments")
      .select("amount_centavos, status")
      .eq("provider", "mock")
      .eq("provider_ref", ref)
      .maybeSingle();
    if (data) {
      amount = (data as { amount_centavos: number }).amount_centavos;
      status = (data as { status: string }).status;
    }
  }
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-6">
      <p className="rounded-control bg-amber-chip text-amber-chip-ink px-4 py-3 text-sm font-medium">
        DEVELOPMENT ONLY. No real money moves.
      </p>
      <Card className="flex flex-col gap-4">
        <h1 className="text-card-title">Mock checkout</h1>
        {!hasKey ? (
          <p className="text-muted">
            Set SUPABASE_SERVICE_ROLE_KEY in .env.local to use the mock checkout.
          </p>
        ) : amount === null ? (
          <p className="text-muted">Unknown payment link.</p>
        ) : (
          <>
            <p className="tabular text-3xl font-semibold">{formatPHP(amount)}</p>
            {status === "succeeded" ? (
              <p
                role="status"
                className="rounded-control bg-mint text-mint-ink px-4 py-3 font-medium"
              >
                Paid. You can close this page.
              </p>
            ) : (
              <form action={simulatePayment}>
                <input type="hidden" name="ref" value={ref} />
                <Button type="submit" variant="mint" className="w-full">
                  Simulate GCash payment
                </Button>
              </form>
            )}
          </>
        )}
      </Card>
    </main>
  );
}
