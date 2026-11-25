export type OfferRowState = {
  status: "proposed" | "sent" | "accepted" | "declined" | "expired" | "skipped";
  starts_at: string;
  expires_at: string | null;
};
export type OfferState = "open" | "accepted" | "closed" | "expired";

/**
 * What a patient sees for a private offer link. Only an approved ("sent") offer that has not expired
 * and has not started is open. Anything else is closed, with no detail that leaks why.
 */
export function offerState(o: OfferRowState, now: Date): OfferState {
  if (o.status === "accepted") return "accepted";
  if (o.status !== "sent") return "closed";
  const t = now.getTime();
  if (o.expires_at && new Date(o.expires_at).getTime() <= t) return "expired";
  if (new Date(o.starts_at).getTime() <= t) return "expired";
  return "open";
}
