/**
 * Only allow same-site relative paths in `next` parameters, to prevent open redirects.
 * Returns null for anything else (absolute URLs, protocol-relative `//x`, backslashes, control chars).
 */
export function safeNext(value: unknown): string | null {
  if (typeof value !== "string") return null;
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return null;
  if (/[\\\u0000-\u001f]/.test(value)) return null;
  return value;
}
