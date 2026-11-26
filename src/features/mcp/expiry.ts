/** Token lifetimes owners can choose. The database caps expires_at at 366 days. */
export const MCP_EXPIRY_DAYS = [30, 90, 365] as const;
export type McpExpiryDays = (typeof MCP_EXPIRY_DAYS)[number];

export function expiryFromChoice(days: number, now: Date = new Date()): Date {
  return new Date(now.getTime() + days * 86_400_000);
}

export type TokenState = "active" | "expired" | "revoked";
export function tokenState(
  token: { revoked_at: string | null; expires_at: string },
  now: Date = new Date(),
): TokenState {
  if (token.revoked_at) return "revoked";
  return Date.parse(token.expires_at) <= now.getTime() ? "expired" : "active";
}
