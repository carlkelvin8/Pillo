"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { logInvoiceLinkSharedAction } from "@/features/invoices/actions";
import { invoiceLabel } from "@/features/invoices/totals";

export function ShareInvoiceMessage({ invoiceId, invoiceNumber, url }: { invoiceId: string; invoiceNumber: number; url: string }) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const message = `Hello! Here is ${invoiceLabel(invoiceNumber)} from our clinic. You can review and pay securely here: ${url}`;
  async function copy() {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true); setError("");
      const form = new FormData(); form.set("invoiceId", invoiceId);
      startTransition(async () => { await logInvoiceLinkSharedAction({}, form); });
    } catch { setError("Could not copy the message. Please copy it manually."); }
  }
  return <div className="flex flex-col gap-2">
    <p className="text-muted text-sm">Copy this message for your usual channel. Pillo will not send it.</p>
    <textarea readOnly value={message} rows={3} className="border-line-strong bg-surface text-ink rounded-control border p-3 text-sm" aria-label="Copyable invoice message" />
    <Button type="button" variant="ghost" disabled={pending} onClick={() => void copy()}>{copied ? "Copied" : "Copy message"}</Button>
    {error ? <p role="alert" className="text-danger-chip-ink text-sm">{error}</p> : null}
  </div>;
}
