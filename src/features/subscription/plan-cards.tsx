import { Check } from "lucide-react";
import { Card, CardTitle } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { CURRENT_PLAN, PLANNED_PLANS } from "./plans";

/** Current plan plus the plans that are planned. Informational only: nothing here charges money. */
export function PlanCards() {
  return (
    <>
      <Card className="flex flex-col gap-3" aria-labelledby="current-plan">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle id="current-plan">Your plan</CardTitle>
          <Chip tone="success">Current</Chip>
        </div>
        <p className="text-2xl font-semibold tracking-tight">{CURRENT_PLAN.name}</p>
        <p className="text-muted text-sm">{CURRENT_PLAN.description}</p>
      </Card>

      <section aria-labelledby="planned-plans" className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <h2 id="planned-plans" className="text-card-title">
            Paid plans
          </h2>
          <Chip tone="pending">Coming soon</Chip>
        </div>
        <p className="text-muted text-sm">
          Subscriptions are not available yet and you will not be charged. Prices and what each plan
          includes may change before launch.
        </p>
        <ul className="grid gap-4 sm:grid-cols-2">
          {PLANNED_PLANS.map((plan) => (
            <li key={plan.id}>
              <Card className="flex h-full flex-col gap-4">
                <div>
                  <p className="text-card-title">{plan.name}</p>
                  <p className="text-muted mt-1 text-sm">{plan.audience}</p>
                </div>
                <p className="tabular text-xl font-semibold">{plan.price}</p>
                <ul className="flex flex-col gap-2 text-sm">
                  {plan.includes.map((item) => (
                    <li key={item} className="flex items-start gap-2">
                      <Check className="text-mint-ink mt-0.5 size-4 shrink-0" aria-hidden="true" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </Card>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
