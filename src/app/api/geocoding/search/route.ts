import { NextResponse } from "next/server";
import { can } from "@/features/auth/permissions";
import { getWorkspace } from "@/features/auth/workspace";

export const runtime = "nodejs";

const CACHE_TTL_MS = 5 * 60_000;
const MIN_REQUEST_INTERVAL_MS = 1000;
const MAX_QUERY_LENGTH = 200;
const searchCache = new Map<string, { expiresAt: number; body: unknown }>();
let nextProviderRequestAt = 0;

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
      headers: {
        Accept: "application/json",
        "User-Agent": `PilloClinicSaaS/1.0 (${process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"})`,
      },
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`Geocoder returned ${response.status}`);
    const body: unknown = await response.json();
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
