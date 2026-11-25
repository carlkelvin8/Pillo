import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { splitPHP } from "@/lib/money";

/** Clinic balance from successful online payments, less recorded payouts. */
export function BalanceHero({
  centavos,
  className = "",
}: {
  centavos: number;
  className?: string;
}) {
  const { whole, cents } = splitPHP(centavos);
  return (
    <Card
      variant="hero"
      aria-label="Clinic balance"
      className={`relative flex flex-col gap-6 overflow-hidden ${className}`}
    >
      <p className="text-faint">Clinic balance</p>
      <p className="tabular text-5xl font-semibold tracking-tight">
        {whole}
        <span className="text-faint text-3xl">{cents}</span>
      </p>
      <p className="text-faint text-sm">
        Successful online payments, less recorded payouts. Cash and bank transfers recorded by staff
        are not included.
      </p>
      <div className="flex flex-wrap gap-3">
        <Button asChild variant="ghost" className="border-ink-2 text-surface hover:bg-ink-2">
          <Link href="/invoices">Request payment</Link>
        </Button>
      </div>
    </Card>
  );
}
