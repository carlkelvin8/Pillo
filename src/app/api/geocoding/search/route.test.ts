import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/features/auth/workspace", () => ({
  getWorkspace: vi.fn(async () => ({ membership: { role: "owner" } })),
}));

import { GET } from "./route";
import { getWorkspace } from "@/features/auth/workspace";

let testNow = Date.now();
const mockGetWorkspace = vi.mocked(getWorkspace);

describe("GET /api/geocoding/search", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    testNow += 2000;
    vi.spyOn(Date, "now").mockReturnValue(testNow);
    vi.stubGlobal("fetch", vi.fn());
    vi.stubEnv("GEOCODING_SEARCH_URL", "https://geocoder.example/search");
    mockGetWorkspace.mockResolvedValue({ membership: { role: "owner" } } as never);
  });

  it("requires a signed-in clinic staff member", async () => {
    mockGetWorkspace.mockResolvedValue(null);

    const response = await GET(new Request("http://localhost/api/geocoding/search?q=Manila"));

    expect(response.status).toBe(403);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("validates a query and sends an identified, user-triggered search to the configured provider", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify([{ lat: "14.6", lon: "121.0", display_name: "Manila" }]), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    const response = await GET(new Request("http://localhost/api/geocoding/search?q=Manila"));

    expect(response.status).toBe(200);
    expect(String(vi.mocked(fetch).mock.calls[0]?.[0])).toBe(
      "https://geocoder.example/search?format=jsonv2&limit=5&q=Manila",
    );
    expect(vi.mocked(fetch).mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({
        headers: expect.objectContaining({
          Accept: "application/json",
          "User-Agent": expect.stringContaining("Pillo"),
        }),
      }),
    );
  });

  it("rejects blank queries without contacting the provider", async () => {
    const response = await GET(new Request("http://localhost/api/geocoding/search?q=%20%20"));

    expect(response.status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("limits provider calls across API clients to one per second", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response("[]", { status: 200, headers: { "content-type": "application/json" } }),
    );
    const first = await GET(new Request("http://localhost/api/geocoding/search?q=Throttle%20test"));
    const second = await GET(new Request("http://localhost/api/geocoding/search?q=Quezon%20City"));

    expect(first.status).toBe(200);
    expect(second.status).toBe(429);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("caches identical searches so they do not consume another provider request", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response("[]", { status: 200, headers: { "content-type": "application/json" } }),
    );
    const first = await GET(new Request("http://localhost/api/geocoding/search?q=Cached%20place"));
    const second = await GET(new Request("http://localhost/api/geocoding/search?q=Cached%20place"));

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("returns 502 on a provider timeout and passes an abort signal", async () => {
    vi.mocked(fetch).mockRejectedValue(new DOMException("timeout", "TimeoutError"));
    const response = await GET(
      new Request("http://localhost/api/geocoding/search?q=Timeout%20place"),
    );
    expect(response.status).toBe(502);
    expect(vi.mocked(fetch).mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it("returns 502 for an invalid body and does not cache it", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ error: "nope" }), { status: 200 }),
    );
    const first = await GET(new Request("http://localhost/api/geocoding/search?q=Bad%20body"));
    expect(first.status).toBe(502);
    testNow += 2000;
    vi.mocked(Date.now).mockReturnValue(testNow);
    vi.mocked(fetch).mockResolvedValue(new Response("[]", { status: 200 }));
    const second = await GET(new Request("http://localhost/api/geocoding/search?q=Bad%20body"));
    expect(second.status).toBe(200);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("returns only whitelisted fields and at most five places", async () => {
    const place = (n: number) => ({
      lat: "14.6",
      lon: "121.0",
      display_name: `P${n}`,
      osm_id: n,
      address: { house_number: "1" },
    });
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify(Array.from({ length: 8 }, (_, i) => place(i))), { status: 200 }),
    );
    const response = await GET(
      new Request("http://localhost/api/geocoding/search?q=Many%20places"),
    );
    const body = await response.json();
    expect(body).toHaveLength(5);
    expect(body[0]).toEqual({ lat: "14.6", lon: "121.0", display_name: "P0" });
  });
});
