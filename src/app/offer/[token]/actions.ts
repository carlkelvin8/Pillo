"use server";

import { redirect } from "next/navigation";
import { acceptOffer, declineOffer } from "@/features/chair-filler/accept";
import { rateLimit } from "@/lib/rate-limit";
import { createServiceClient } from "@/lib/supabase/service";
import { serverEnv } from "@/lib/env-server";

/** Public actions: the private token in the URL is the only credential. */
async function run(token: string, fn: "accept" | "decline"): Promise<string> {
  if (!serverEnv().SUPABASE_SERVICE_ROLE_KEY) return "closed";
  if (!rateLimit(`offer:${token.slice(0, 12)}`, 10, 60_000)) return "closed";
  const svc = createServiceClient();
  if (fn === "decline") {
    await declineOffer(svc, token);
    return "declined";
  }
  return acceptOffer(svc, token);
}

export async function acceptOfferAction(token: string): Promise<void> {
  redirect(`/offer/${encodeURIComponent(token)}?r=${await run(token, "accept")}`);
}
export async function declineOfferAction(token: string): Promise<void> {
  redirect(`/offer/${encodeURIComponent(token)}?r=${await run(token, "decline")}`);
}
