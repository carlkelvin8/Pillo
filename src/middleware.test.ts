import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/middleware", () => ({ updateSession: vi.fn(), redirectKeepingCookies: vi.fn() }));

import { isPublicPath } from "./middleware";

describe("isPublicPath", () => {
  it.each([
    "/",
    "/styleguide",
    "/api/webhooks/paymongo",
    "/api/mcp",
    "/pay/mock/abc",
    "/chat/my-clinic",
    "/api/chat/my-clinic/messages",
    "/offer/token123",
  ])("allows %s", (p) => expect(isPublicPath(p)).toBe(true));

  it.each(["/payments", "/chatty", "/offers", "/dashboard", "/invoices/1", "/styleguides"])(
    "protects %s",
    (p) => expect(isPublicPath(p)).toBe(false),
  );
});
