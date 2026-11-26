import { z } from "zod";

export const SEARCH_LIMIT = 5;

/**
 * Characters with meaning inside a PostgREST `or()` filter (`,` `(` `)` `"`), an ILIKE pattern
 * (`%` `_` `\\`) or PostgREST's `*` wildcard alias. Apostrophes, colons and the like are plain
 * text in an unquoted value, so names such as O'Brien keep working.
 */
const UNSAFE = /[%_\\,()*"]/g;

export const searchQuerySchema = z
  .string()
  .transform((v) => v.replace(UNSAFE, " ").replace(/\s+/g, " ").trim())
  .pipe(z.string().min(2, "Type at least 2 characters.").max(60));

export type SearchResultGroup = "patients" | "invoices";
export type SearchResult = {
  group: SearchResultGroup;
  id: string;
  title: string;
  subtitle: string;
  href: string;
};
export type SearchResponse = { results: SearchResult[] };

/** "INV-0012", "inv 12" or "12" -> 12; anything else -> null. */
export function parseInvoiceNumber(q: string): number | null {
  const m = /^(?:inv[-\s]?)?(\d{1,9})$/i.exec(q.trim());
  return m ? Number(m[1]) : null;
}
