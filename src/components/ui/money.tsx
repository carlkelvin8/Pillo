import type { ComponentProps } from "react";
import { formatPHP } from "@/lib/money";
import { cn } from "@/lib/utils";

type MoneyProps = Omit<ComponentProps<"span">, "children"> & { centavos: number };

/** Renders integer centavos as ₱ with tabular figures. */
export function Money({ centavos, className, ...props }: MoneyProps) {
  return (
    <span className={cn("tabular", className)} {...props}>
      {formatPHP(centavos)}
    </span>
  );
}
