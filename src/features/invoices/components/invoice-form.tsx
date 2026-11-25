"use client";

import { Plus, Trash2 } from "lucide-react";
import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/form-message";
import { Input, Select, Textarea } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { createInvoiceAction } from "@/features/invoices/actions";
import { computeTotals } from "@/features/invoices/totals";
import { PatientPicker } from "@/features/patients/components/patient-picker";
import type { ActionState } from "@/lib/action-state";
import { formatPHP, parsePesosToCentavos } from "@/lib/money";

type Props = {
  doctors: { id: string; name: string }[];
  branches: { id: string; name: string }[];
  today: string;
  defaultDue: string;
};

type Row = { key: number; description: string; quantity: string; price: string };

const toCentavos = (v: string) => (v.trim() === "" ? 0 : (parsePesosToCentavos(v) ?? 0));

export function InvoiceForm({ doctors, branches, today, defaultDue }: Props) {
  const [state, action] = useActionState<ActionState, FormData>(createInvoiceAction, {});
  const [rows, setRows] = useState<Row[]>([{ key: 1, description: "", quantity: "1", price: "" }]);
  const [nextKey, setNextKey] = useState(2);
  const [discount, setDiscount] = useState(state.values?.discount ?? "");
  const [tax, setTax] = useState(state.values?.tax ?? "");

  const totals = computeTotals(
    rows.map((r) => ({
      quantity: Math.max(0, Math.floor(Number(r.quantity) || 0)),
      unitPriceCentavos: toCentavos(r.price),
    })),
    toCentavos(discount),
    toCentavos(tax),
  );
  const update = (key: number, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const err = (k: string) => state.fieldErrors?.[k]?.[0];

  return (
    <form action={action} className="grid items-start gap-6 lg:grid-cols-[1.7fr_1fr]">
      <div className="flex flex-col gap-6">
        <FormMessage state={state} />
        <Card className="flex flex-col gap-5">
          <CardTitle>Details</CardTitle>
          <PatientPicker error={err("patientId")} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Doctor">
              <Select name="doctorId" defaultValue="">
                <option value="">Not specified</option>
                {doctors.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </Select>
            </Field>
            {branches.length > 1 ? (
              <Field label="Branch">
                <Select name="branchId" defaultValue="">
                  <option value="">Not specified</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </Select>
              </Field>
            ) : null}
            <Field label="Invoice date" error={err("issuedOn")}>
              <Input
                name="issuedOn"
                type="date"
                required
                defaultValue={state.values?.issuedOn ?? today}
              />
            </Field>
            <Field label="Due date" error={err("dueOn")}>
              <Input
                name="dueOn"
                type="date"
                required
                defaultValue={state.values?.dueOn ?? defaultDue}
              />
            </Field>
          </div>
        </Card>

        <Card className="flex flex-col gap-4">
          <CardTitle>Items</CardTitle>
          {err("items") ? (
            <p role="alert" className="text-danger-chip-ink text-sm">
              {err("items")}
            </p>
          ) : null}
          <ul className="flex flex-col gap-3">
            {rows.map((r, i) => {
              const amount = Math.max(0, Math.floor(Number(r.quantity) || 0)) * toCentavos(r.price);
              return (
                <li
                  key={r.key}
                  className="grid grid-cols-[1fr_72px_120px_auto] items-end gap-3 max-sm:grid-cols-2"
                >
                  <Field label={i === 0 ? "Description" : `Item ${i + 1}`}>
                    <Input
                      name="itemDescription"
                      maxLength={200}
                      value={r.description}
                      onChange={(e) => update(r.key, { description: e.target.value })}
                      placeholder="e.g. Consultation"
                    />
                  </Field>
                  <Field label="Qty">
                    <Input
                      name="itemQuantity"
                      inputMode="numeric"
                      value={r.quantity}
                      onChange={(e) => update(r.key, { quantity: e.target.value })}
                    />
                  </Field>
                  <Field label="Price (₱)">
                    <Input
                      name="itemPrice"
                      inputMode="decimal"
                      value={r.price}
                      onChange={(e) => update(r.key, { price: e.target.value })}
                      placeholder="0.00"
                    />
                  </Field>
                  <div className="flex min-h-11 items-center gap-2">
                    <span className="tabular w-24 text-right text-sm font-medium">
                      {formatPHP(amount)}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Remove item ${i + 1}`}
                      disabled={rows.length === 1}
                      onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}
                    >
                      <Trash2 aria-hidden="true" />
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
          <div>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setRows((rs) => [
                  ...rs,
                  { key: nextKey, description: "", quantity: "1", price: "" },
                ]);
                setNextKey((k) => k + 1);
              }}
            >
              <Plus aria-hidden="true" /> Add line item
            </Button>
          </div>
        </Card>

        <Card className="flex flex-col gap-3">
          <CardTitle>Note</CardTitle>
          <Field label="Note to patient">
            <Textarea
              name="note"
              maxLength={500}
              defaultValue={state.values?.note}
              placeholder="Thank you for visiting."
            />
          </Field>
        </Card>
      </div>

      <Card variant="hero" className="flex flex-col gap-5 lg:sticky lg:top-6">
        <div>
          <p className="text-faint">Total due</p>
          <p className="tabular mt-1 text-4xl font-semibold tracking-tight" aria-live="polite">
            {formatPHP(totals.total)}
          </p>
        </div>
        <dl className="flex flex-col gap-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-faint">Subtotal</dt>
            <dd className="tabular">{formatPHP(totals.subtotal)}</dd>
          </div>
        </dl>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-faint flex flex-col gap-1.5 text-sm">
            Discount (₱)
            <Input
              name="discount"
              inputMode="decimal"
              value={discount}
              onChange={(e) => setDiscount(e.target.value)}
              placeholder="0.00"
              aria-invalid={err("discount") ? true : undefined}
              className="border-ink-2 bg-ink text-surface placeholder:text-faint"
            />
            {err("discount") ? <span className="text-danger-chip">{err("discount")}</span> : null}
          </label>
          <label className="text-faint flex flex-col gap-1.5 text-sm">
            Tax (₱)
            <Input
              name="tax"
              inputMode="decimal"
              value={tax}
              onChange={(e) => setTax(e.target.value)}
              placeholder="0.00"
              className="border-ink-2 bg-ink text-surface placeholder:text-faint"
            />
            <span className="text-xs">
              Enter the amount. Rates depend on your clinic&apos;s tax status.
            </span>
          </label>
        </div>
        <div className="flex flex-col gap-2">
          <SubmitButton
            name="intent"
            value="send"
            variant="mint"
            pendingLabel="Creating…"
            className="w-full"
          >
            Create and send
          </SubmitButton>
          <SubmitButton
            name="intent"
            value="draft"
            variant="ghost"
            pendingLabel="Saving…"
            className="border-ink-2 text-surface hover:bg-ink-2 w-full"
          >
            Save draft
          </SubmitButton>
        </div>
        <p className="text-faint text-xs">
          &ldquo;Send&rdquo; marks the invoice as sent. Delivery by SMS or Messenger starts with the
          messaging phase.
        </p>
      </Card>
    </form>
  );
}
