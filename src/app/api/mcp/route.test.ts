import { beforeEach, describe, expect, it, vi } from "vitest";

const authenticate = vi.hoisted(() => vi.fn());
const build = vi.hoisted(() => vi.fn());
vi.mock("@/features/mcp/auth", () => ({ authenticateMcp: authenticate }));
vi.mock("@/features/mcp/server", () => ({ buildMcpServer: build }));

import { POST } from "./route";

describe("MCP HTTP route", () => {
  beforeEach(() => {
    authenticate.mockReset();
    build.mockReset();
  });

  it("returns an opaque service unavailable response when its database is unreachable", async () => {
    authenticate.mockRejectedValue(new Error("connection string and credentials must not leak"));

    const response = await POST(new Request("http://localhost/api/mcp", { method: "POST" }));

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "MCP service is temporarily unavailable." });
    expect(response.headers.get("content-type")).toContain("application/json");
  });

  it("rejects an unknown bearer token before building the MCP server", async () => {
    authenticate.mockResolvedValue(null);

    const response = await POST(new Request("http://localhost/api/mcp", { method: "POST" }));

    expect(response.status).toBe(401);
    expect(build).not.toHaveBeenCalled();
  });
});
