import { beforeEach, describe, expect, it } from "vitest";
import { resetRateLimits } from "@/lib/rate-limit";
import { POST } from "./[slug]/message/route";
import { GET } from "./[slug]/messages/route";

const params = { params: Promise.resolve({ slug: "any-clinic" }) };
const headers = { "x-forwarded-for": "203.0.113.9" };

describe("public chat rate limits", () => {
  beforeEach(resetRateLimits);

  it("answers 429 with Retry-After and a generic body after 20 messages a minute", async () => {
    const send = () =>
      POST(
        new Request("http://x/api/chat/any-clinic/message", {
          method: "POST",
          headers,
          body: JSON.stringify({ message: "hi" }),
        }),
        params,
      );
    for (let i = 0; i < 20; i++) expect((await send()).status).not.toBe(429);
    const limited = await send();
    expect(limited.status).toBe(429);
    expect(limited.headers.get("Retry-After")).toBe("60");
    expect(limited.headers.get("Cache-Control")).toBe("no-store");
    expect(await limited.json()).toEqual({ error: "Too many messages. Please wait a moment." });
  });

  it("limits polling the same way", async () => {
    const poll = () =>
      GET(new Request("http://x/api/chat/any-clinic/messages", { headers }), params);
    for (let i = 0; i < 60; i++) expect((await poll()).status).not.toBe(429);
    const limited = await poll();
    expect(limited.status).toBe(429);
    expect(limited.headers.get("Retry-After")).toBe("60");
  });
});
