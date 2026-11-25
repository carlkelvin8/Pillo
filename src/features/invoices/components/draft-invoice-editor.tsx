"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { updateDraftInvoiceAction } from "@/features/invoices/actions";
import { PatientPicker } from "@/features/patients/components/patient-picker";
import type { ActionState } from "@/lib/action-state";

type Props = {
  invoiceId: string;
  dueOn: string;
  patient: { id: string; name: string; number: number } | null;
  items: { description: string; quantity: number; unit_price_centavos: number }[];
};
export function DraftInvoiceEditor({ invoiceId, dueOn, patient, items }: Props) {
  const [state, action] = useActionState<ActionState, FormData>(updateDraftInvoiceAction, {});
  const [rows, setRows] = useState(
    items.map((item) => ({
      description: item.description,
      quantity: String(item.quantity),
      price: (item.unit_price_centavos / 100).toFixed(2),
    })),
  );
  return (
    <details className="rounded-control border-line @container border">
      <summary className="cursor-pointer px-5 py-4 font-semibold">Edit draft invoice</summary>
      <form action={action} className="border-line flex flex-col gap-4 border-t p-5">
        <input type="hidden" name="invoiceId" value={invoiceId} />
        <PatientPicker initial={patient} />
        <label className="text-muted flex flex-col gap-1 text-sm">
          Due date
          <input
            name="dueOn"
            type="date"
            required
            defaultValue={dueOn}
            className="border-line-strong bg-surface text-ink rounded-control min-h-11 border px-3"
          />
        </label>
        <div className="flex flex-col gap-3">
          <CardTitle>Items</CardTitle>
          {rows.map((row, index) => (
            <div
              key={index}
              className="grid gap-2 @min-[29rem]:grid-cols-[minmax(0,1fr)_5rem_6rem_auto] [&>input]:min-w-0"
            >
              <Input
                aria-label={`Item ${index + 1} description`}
                value={row.description}
                onChange={(event) =>
                  setRows((all) =>
                    all.map((item, i) =>
                      i === index ? { ...item, description: event.target.value } : item,
                    ),
                  )
                }
              />
              <Input
                aria-label={`Item ${index + 1} quantity`}
                inputMode="numeric"
                value={row.quantity}
                onChange={(event) =>
                  setRows((all) =>
                    all.map((item, i) =>
                      i === index ? { ...item, quantity: event.target.value } : item,
                    ),
                  )
                }
              />
              <Input
                aria-label={`Item ${index + 1} unit price in PHP`}
                inputMode="decimal"
                value={row.price}
                onChange={(event) =>
                  setRows((all) =>
                    all.map((item, i) =>
                      i === index ? { ...item, price: event.target.value } : item,
                    ),
                  )
                }
              />
              <Button
                variant="ghost"
                type="button"
                disabled={rows.length === 1}
                onClick={() => setRows((all) => all.filter((_, i) => i !== index))}
              >
                Remove
              </Button>
            </div>
          ))}
          <Button
            variant="ghost"
            type="button"
            onClick={() =>
              setRows((all) => [...all, { description: "", quantity: "1", price: "" }])
            }
          >
            Add item
          </Button>
        </div>
        {rows.map((row, index) => (
          <input
            key={`payload-${index}`}
            type="hidden"
            name="items"
            value={JSON.stringify({
              description: row.description,
              quantity: row.quantity,
              price: row.price,
            })}
          />
        ))}
        {state.message ? (
          <p
            role={state.ok ? "status" : "alert"}
            className={state.ok ? "text-muted text-sm" : "text-danger-chip-ink text-sm"}
          >
            {state.message}
          </p>
        ) : null}
        <div>
          <SubmitButton pendingLabel="Saving…">Save draft</SubmitButton>
        </div>
      </form>
    </details>
  );
}
