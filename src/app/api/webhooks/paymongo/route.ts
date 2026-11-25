import { NextResponse } from "next/server";
import { parsePaidEvent, verifyPaymongoSignature } from "@/features/payments/webhook";
import { serverEnv } from "@/lib/env-server";
import { createServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";
const MAX_BODY = 100_000;

/**
 * PayMongo webhook. Order matters: verify the signature on the RAW body first, only then parse.
 * Processing is idempotent in the database, so PayMongo's retries are safe. Never log the body
 * (it can contain payer details): only the event id and our outcome.
 */
export async function POST(request: Request) {
  const secret = serverEnv().PAYMONGO_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "Webhook not configured" }, { status: 503 });

  const rawBody = await request.text();
  if (rawBody.length > MAX_BODY)
    return NextResponse.json({ error: "Payload too large" }, { status: 413 });

  const ok = verifyPaymongoSignature({
    rawBody,
    header: request.headers.get("paymongo-signature"),
    secret,
  });
  if (!ok) return NextResponse.json({ error: "Invalid signature" }, { status: 400 });

  let json: unknown;
  try {
    json = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const event = parsePaidEvent(json);
  if (!event) return NextResponse.json({ ignored: true });

  const supabase = createServiceClient();
  const { data, error } = await supabase.rpc("apply_provider_payment", {
    p_provider: "paymongo",
    p_event_id: event.eventId,
    p_event_type: event.eventType,
    p_provider_ref: event.providerRef,
    p_method: event.method,
    p_amount_centavos: event.amountCentavos,
    p_reference: event.reference,
    p_paid_at: event.paidAt,
  });
  if (error) {
    console.error("paymongo webhook failed", { event: event.eventId, code: error.code });
    // A 5xx makes PayMongo retry later.
    return NextResponse.json({ error: "Could not process" }, { status: 500 });
  }
  if (data !== "applied" && data !== "duplicate" && data !== "already_paid") {
    // Needs a human: unknown link or amount mismatch. Acknowledge so it is not retried forever.
    console.error("paymongo webhook needs review", { event: event.eventId, outcome: data });
  }
  return NextResponse.json({ outcome: data });
}
