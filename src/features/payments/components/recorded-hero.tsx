import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { splitPHP } from "@/lib/money";

/** Total of payments staff recorded this month. Pillo is a payment record: it does not hold money. */
export function RecordedHero({
  centavos,
  count,
  className = "",
}: {
  centavos: number;
  count: number;
  className?: string;
}) {
  const { whole, cents } = splitPHP(centavos);
  return (
    <Card
      variant="hero"
      aria-label="Payments recorded this month"
      className={`relative flex flex-col gap-6 overflow-hidden ${className}`}
    >
      <p className="text-faint">Recorded this month</p>
      <p className="tabular text-4xl font-semibold tracking-tight sm:text-5xl">
        {whole}
        <span className="text-faint text-2xl sm:text-3xl">{cents}</span>
      </p>
      <p className="text-faint text-sm">
        {count === 0
          ? "No payments recorded yet this month."
          : `${count} ${count === 1 ? "payment" : "payments"} recorded.`}{" "}
        Pillo keeps your payment record. Online collection through GCash, QR Ph and cards is coming
        soon.
      </p>
      <div className="flex flex-wrap gap-3">
        <Button asChild variant="ghost" className="border-ink-2 text-surface hover:bg-ink-2">
          <Link href="/invoices">Record a payment</Link>
        </Button>
      </div>
    </Card>
  );
}
