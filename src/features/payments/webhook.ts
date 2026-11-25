import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

/** Reject signatures older than this, to stop replays of a captured request. */
export const SIGNATURE_TOLERANCE_SEC = 300;

export type PaymentMethod = "gcash" | "maya" | "card" | "cash" | "bank";

function parseHeader(header: string): Map<string, string> {
  const parts = new Map<string, string>();
  for (const piece of header.split(",")) {
    const i = piece.indexOf("=");
    if (i > 0) parts.set(piece.slice(0, i).trim(), piece.slice(i + 1).trim());
  }
  return parts;
}

const safeEqualHex = (a: string, b: string): boolean => {
  if (a.length !== b.length || a.length === 0) return false;
  const ba = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  return ba.length === bb.length && timingSafeEqual(ba, bb);
};

/**
 * Verify a `Paymongo-Signature` header (`t=<unix>,te=<test sig>,li=<live sig>`): HMAC-SHA256 of
 * `<t>.<raw body>` with the webhook secret. Must be run on the RAW body, before any JSON parsing.
 */
export function verifyPaymongoSignature(args: {
  rawBody: string;
  header: string | null;
  secret: string;
  nowMs?: number;
  toleranceSec?: number;
}): boolean {
  const { rawBody, header, secret } = args;
  if (!header || !secret) return false;
  const parts = parseHeader(header);
  const t = parts.get("t");
  if (!t || !/^\d{1,12}$/.test(t)) return false;
  const nowSec = (args.nowMs ?? Date.now()) / 1000;
  if (Math.abs(nowSec - Number(t)) > (args.toleranceSec ?? SIGNATURE_TOLERANCE_SEC)) return false;

  const expected = createHmac("sha256", secret).update(`${t}.${rawBody}`).digest("hex");
  return [parts.get("te"), parts.get("li")].some(
    (sig) => typeof sig === "string" && safeEqualHex(sig, expected),
  );
}

const paidEventSchema = z.object({
  data: z.object({
    id: z.string().min(1),
    attributes: z.object({
      type: z.literal("link.payment.paid"),
      data: z.object({
        id: z.string().min(1), // the payment link, e.g. link_xxx
        attributes: z.object({
          reference_number: z.string().optional(),
          payments: z
            .array(
              z.object({
                data: z.object({
                  id: z.string(),
                  attributes: z.object({
                    amount: z.number().int().positive(),
                    paid_at: z.number().optional(),
                    source: z.object({ type: z.string() }),
                  }),
                }),
              }),
            )
            .min(1),
        }),
      }),
    }),
  }),
});

export type NormalizedPaidEvent = {
  eventId: string;
  eventType: "link.payment.paid";
  providerRef: string;
  method: PaymentMethod;
  amountCentavos: number;
  reference: string;
  paidAt: string | null;
};

export function mapPaymongoMethod(source: string): PaymentMethod {
  switch (source) {
    case "gcash":
      return "gcash";
    case "paymaya":
      return "maya";
    case "card":
      return "card";
    default:
      return "bank";
  }
}

/** Returns null for anything that is not a paid-link event (those are acknowledged and ignored). */
export function parsePaidEvent(payload: unknown): NormalizedPaidEvent | null {
  const parsed = paidEventSchema.safeParse(payload);
  if (!parsed.success) return null;
  const link = parsed.data.data.attributes.data;
  const payment = link.attributes.payments[0]?.data;
  if (!payment) return null;
  return {
    eventId: parsed.data.data.id,
    eventType: "link.payment.paid",
    providerRef: link.id,
    method: mapPaymongoMethod(payment.attributes.source.type),
    amountCentavos: payment.attributes.amount,
    reference: link.attributes.reference_number ?? payment.id,
    paidAt: payment.attributes.paid_at
      ? new Date(payment.attributes.paid_at * 1000).toISOString()
      : null,
  };
}
