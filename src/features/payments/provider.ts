import { randomUUID } from "node:crypto";
import { z } from "zod";
import { publicEnv } from "@/lib/env";
import { serverEnv } from "@/lib/env-server";

export type PaymentLink = {
  provider: "paymongo" | "mock";
  providerRef: string;
  checkoutUrl: string;
};

export type CreateLinkInput = {
  amountCentavos: number;
  /** Shown to the payer. Must not contain patient names or contact details. */
  description: string;
};

/** Anything that can turn an amount into a link a patient can pay. PayMongo today; others can slot in. */
export interface PaymentProvider {
  readonly name: PaymentLink["provider"];
  createPaymentLink(input: CreateLinkInput): Promise<PaymentLink>;
}

const linkResponseSchema = z.object({
  data: z.object({
    id: z.string().min(1),
    attributes: z.object({ checkout_url: z.url() }),
  }),
});

class PayMongoProvider implements PaymentProvider {
  readonly name = "paymongo" as const;
  constructor(private readonly secretKey: string) {}

  async createPaymentLink({ amountCentavos, description }: CreateLinkInput): Promise<PaymentLink> {
    if (!Number.isSafeInteger(amountCentavos) || amountCentavos <= 0)
      throw new Error("Invalid amount");
    const res = await fetch("https://api.paymongo.com/v1/links", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${Buffer.from(`${this.secretKey}:`).toString("base64")}`,
      },
      body: JSON.stringify({ data: { attributes: { amount: amountCentavos, description } } }),
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`PayMongo rejected the request (${res.status})`);
    const parsed = linkResponseSchema.parse(await res.json());
    return {
      provider: "paymongo",
      providerRef: parsed.data.id,
      checkoutUrl: parsed.data.attributes.checkout_url,
    };
  }
}

/** Development only: a fake link that points at /pay/mock/<ref>. Never available in production. */
class MockProvider implements PaymentProvider {
  readonly name = "mock" as const;
  async createPaymentLink(): Promise<PaymentLink> {
    const ref = `mock_${randomUUID()}`;
    return {
      provider: "mock",
      providerRef: ref,
      checkoutUrl: `${publicEnv().NEXT_PUBLIC_SITE_URL}/pay/mock/${ref}`,
    };
  }
}

export function mockPaymentsEnabled(): boolean {
  return process.env.NODE_ENV !== "production" && serverEnv().PAYMENTS_MODE === "mock";
}

/** The configured provider, or null when none is set up (callers show a clear message). */
export function getPaymentProvider(): PaymentProvider | null {
  if (mockPaymentsEnabled()) return new MockProvider();
  const key = serverEnv().PAYMONGO_SECRET_KEY;
  return key ? new PayMongoProvider(key) : null;
}
