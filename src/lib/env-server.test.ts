import { afterEach, describe, expect, it, vi } from "vitest";
import { serverEnv } from "./env-server";

afterEach(() => vi.unstubAllEnvs());

describe("serverEnv", () => {
  it("drops only the invalid variable", () => {
    vi.stubEnv("GEMINI_API_KEY", "key");
    vi.stubEnv("DATABASE_URL", "not a url");
    vi.stubEnv("PAYMENTS_MODE", "bogus");
    const env = serverEnv();
    expect(env.GEMINI_API_KEY).toBe("key");
    expect(env.DATABASE_URL).toBeUndefined();
    expect(env.PAYMENTS_MODE).toBeUndefined();
  });

  it("accepts postgres URLs for the MCP role and enables live AI only for exact true", () => {
    vi.stubEnv("DATABASE_URL_MCP", "postgresql://pillo_mcp:pw@host:5432/postgres");
    vi.stubEnv("LIVE_AI_ENABLED", "TRUE");
    expect(serverEnv().DATABASE_URL_MCP).toMatch(/^postgresql:/);
    expect(serverEnv().LIVE_AI_ENABLED).toBe(false);
    vi.stubEnv("LIVE_AI_ENABLED", "true");
    expect(serverEnv().LIVE_AI_ENABLED).toBe(true);
  });
});
