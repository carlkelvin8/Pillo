import Link from "next/link";
import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { splitPHP } from "@/lib/money";

/** Ink balance card from the design. The money moves are demo-only until a real payout provider is connected. */
export function BalanceHero({ centavos, children }: { centavos: number; children?: ReactNode }) {
  const { whole, cents } = splitPHP(centavos);
  return (
    <Card
      variant="hero"
      aria-label="Clinic balance"
      className="relative flex flex-col gap-6 overflow-hidden"
    >
      <p className="text-faint">Clinic balance</p>
      <p className="tabular text-5xl font-semibold tracking-tight">
        {whole}
        <span className="text-faint text-3xl">{cents}</span>
      </p>
      <p className="text-faint text-sm">
        Online payments received, minus withdrawals. Cash and bank transfers you record by hand are
        not included.
      </p>
      <div className="flex flex-wrap gap-3">
        <Button asChild variant="ghost" className="border-ink-2 text-surface hover:bg-ink-2">
          <Link href="/invoices">Request payment</Link>
        </Button>
        {children}
      </div>
    </Card>
  );
}
