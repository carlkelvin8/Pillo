import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it, vi } from "vitest";

const executed: string[] = [];
let tokenRows: unknown[] = [];
vi.mock("./database", () => ({
  withMcpTokenHash: async (_hash: string, work: (db: unknown) => Promise<unknown>) =>
    work({
      execute: async (query: Parameters<PgDialect["sqlToQuery"]>[0]) => {
        const text = new PgDialect().sqlToQuery(query).sql;
        executed.push(text);
        return text.includes("from public.mcp_tokens") ? tokenRows : [];
      },
    }),
}));

import { authenticateMcp } from "./auth";

const bearer = `Bearer ${"a".repeat(43)}`;

describe("authenticateMcp", () => {
  it("only matches tokens that are not revoked and not expired", async () => {
    tokenRows = [];
    expect(await authenticateMcp(bearer)).toBeNull();
    const select = executed.find((q) => q.includes("from public.mcp_tokens"))!;
    expect(select).toContain("revoked_at is null");
    expect(select).toContain("expires_at > now()");
    // A rejected token must not be touched or scoped.
    expect(executed.some((q) => q.includes("update public.mcp_tokens"))).toBe(false);
  });

  it("returns the clinic and scopes for a live token and records last use", async () => {
    tokenRows = [{ id: "t1", clinic_id: "c1", scopes: ["appointments:read"] }];
    expect(await authenticateMcp(bearer)).toEqual({
      tokenId: "t1",
      clinicId: "c1",
      scopes: ["appointments:read"],
    });
    expect(executed.some((q) => q.includes("update public.mcp_tokens"))).toBe(true);
  });

  it("rejects a missing or malformed header without querying", async () => {
    executed.length = 0;
    expect(await authenticateMcp(null)).toBeNull();
    expect(await authenticateMcp("Bearer short")).toBeNull();
    expect(executed).toHaveLength(0);
  });
});
