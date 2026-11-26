/**
 * Feature switches. Online payment links (GCash, QR Ph, Maya, cards through PayMongo) stay off until
 * the business is registered with the provider: until then Pillo is a payment record (logbook).
 */
export function onlinePaymentsEnabled(): boolean {
  return process.env.ONLINE_PAYMENTS_ENABLED === "true";
}
