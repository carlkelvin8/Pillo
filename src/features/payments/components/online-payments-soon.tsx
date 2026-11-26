import { Chip } from "@/components/ui/chip";

const METHODS = ["GCash", "QR Ph", "Maya", "Cards"] as const;

/** Tells staff online collection is not available yet. Pillo currently keeps a payment record only. */
export function OnlinePaymentsSoon({ compact = false }: { compact?: boolean }) {
  return (
    <section
      aria-label="Online payments coming soon"
      className="rounded-control bg-canvas border-line flex flex-col gap-3 border p-4"
    >
      <div>
        <p className="text-sm font-semibold">Online payments: coming soon</p>
        {compact ? null : (
          <p className="text-muted mt-1 text-sm">
            Soon patients will be able to pay a link or QR directly and Pillo will mark the invoice
            paid. For now, record each payment after the clinic receives it.
          </p>
        )}
      </div>
      <ul className="flex flex-wrap gap-2" aria-label="Planned payment methods">
        {METHODS.map((m) => (
          <li key={m}>
            <Chip tone="neutral">{m}</Chip>
          </li>
        ))}
      </ul>
    </section>
  );
}
