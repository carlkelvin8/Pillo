/**
 * Money is stored and passed around as integer centavos (₱1.00 = 100).
 * Only format at the edge (UI).
 */
const phpFormatter = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  minimumFractionDigits: 2,
});

export function formatPHP(centavos: number): string {
  if (!Number.isSafeInteger(centavos)) {
    throw new RangeError("Money must be an integer number of centavos");
  }
  return phpFormatter.format(centavos / 100);
}

/** Parse a user-entered peso amount like "1,250.50" into centavos. Returns null if invalid. */
export function parsePesosToCentavos(input: string): number | null {
  const cleaned = input.replace(/[₱,\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const [whole = "0", frac = ""] = cleaned.split(".");
  return Number(whole) * 100 + Number(frac.padEnd(2, "0"));
}

/** "₱482,360" and ".50" separately, so the cents can be styled smaller (hero balance). */
export function splitPHP(centavos: number): { whole: string; cents: string } {
  const full = formatPHP(centavos);
  const i = full.lastIndexOf(".");
  return { whole: full.slice(0, i), cents: full.slice(i) };
}
