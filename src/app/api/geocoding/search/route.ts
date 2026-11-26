import { NextResponse } from "next/server";
import { z } from "zod";
import { can } from "@/features/auth/permissions";
import { getWorkspace } from "@/features/auth/workspace";

export const runtime = "nodejs";

const CACHE_TTL_MS = 5 * 60_000;
const MIN_REQUEST_INTERVAL_MS = 1000;
const MAX_QUERY_LENGTH = 200;
const PROVIDER_TIMEOUT_MS = 5000;
const MAX_RESULTS = 5;
const placeSchema = z.object({
  lat: z.union([z.string(), z.number()]),
  lon: z.union([z.string(), z.number()]),
  display_name: z.string(),
});
const searchCache = new Map<string, { expiresAt: number; body: unknown }>();
let nextProviderRequestAt = 0;

/** Nominatim policy asks for an identifying contact; omit it rather than send a localhost URL. */
function userAgent() {
  const contact = [process.env.GEOCODING_CONTACT, process.env.NEXT_PUBLIC_SITE_URL].find(
    (value) => value && !/localhost|127\.0\.0\.1|\[::1\]/i.test(value),
  );
  return contact ? `PilloClinicSaaS/1.0 (${contact})` : "PilloClinicSaaS/1.0";
}

export async function GET(request: Request) {
  const workspace = await getWorkspace();
  if (!workspace?.membership || !can(workspace.membership.role, "staff.manage"))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (!query || query.length > MAX_QUERY_LENGTH)
    return NextResponse.json({ error: "Enter a valid place or address." }, { status: 400 });

  const now = Date.now();
  const cacheKey = query.toLowerCase();
  const cached = searchCache.get(cacheKey);
  if (cached && cached.expiresAt > now)
    return NextResponse.json(cached.body, {
      headers: { "Cache-Control": "private, no-store" },
    });
  if (cached) searchCache.delete(cacheKey);

  if (now < nextProviderRequestAt) {
    const retryAfter = Math.max(1, Math.ceil((nextProviderRequestAt - now) / 1000));
    return NextResponse.json(
      { error: "Please wait a moment before searching again." },
      {
        status: 429,
        headers: { "Cache-Control": "private, no-store", "Retry-After": String(retryAfter) },
      },
    );
  }

  nextProviderRequestAt = now + MIN_REQUEST_INTERVAL_MS;
  try {
    const providerUrl = new URL(
      process.env.GEOCODING_SEARCH_URL ?? "https://nominatim.openstreetmap.org/search",
    );
    providerUrl.search = new URLSearchParams({ format: "jsonv2", limit: "5", q: query }).toString();
    const response = await fetch(providerUrl, {
      headers: { Accept: "application/json", "User-Agent": userAgent() },
      cache: "no-store",
      signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`Geocoder returned ${response.status}`);
    const raw: unknown = await response.json();
    if (!Array.isArray(raw)) throw new Error("Geocoder returned an unexpected body");
    // Keep only what the client uses; drop malformed entries.
    const body = raw.slice(0, MAX_RESULTS).flatMap((item) => {
      const place = placeSchema.safeParse(item);
      return place.success
        ? [{ lat: place.data.lat, lon: place.data.lon, display_name: place.data.display_name }]
        : [];
    });
    if (searchCache.size >= 500) {
      const oldestKey = searchCache.keys().next().value;
      if (oldestKey) searchCache.delete(oldestKey);
    }
    searchCache.set(cacheKey, { expiresAt: now + CACHE_TTL_MS, body });
    return NextResponse.json(body, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json(
      { error: "Place search is temporarily unavailable." },
      { status: 502, headers: { "Cache-Control": "private, no-store" } },
    );
  }
}
