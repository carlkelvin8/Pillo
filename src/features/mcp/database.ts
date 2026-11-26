import postgres from "postgres";
import { sql } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { serverEnv } from "@/lib/env-server";

/** Same rule as mcpDatabase(): production needs DATABASE_URL_MCP, development may fall back to DATABASE_URL. */
export function mcpDatabaseConfigured(): boolean {
  const env = serverEnv();
  return Boolean(env.DATABASE_URL_MCP ?? (process.env.NODE_ENV === "production" ? undefined : env.DATABASE_URL));
}

let client: PostgresJsDatabase | undefined;

export type McpQueryDb = Pick<PostgresJsDatabase, "execute">;

/** Server-only Drizzle client for stateless MCP requests. */
export function mcpDatabase(): PostgresJsDatabase {
  if (client) return client;
  const env = serverEnv();
  // Least privilege: the MCP route must not use the owner connection in production.
  const url = env.DATABASE_URL_MCP ?? (process.env.NODE_ENV === "production" ? undefined : env.DATABASE_URL);
  if (!url) throw new Error("DATABASE_URL_MCP is not set");
  const sql = postgres(url, { prepare: false, max: 2, idle_timeout: 20, connect_timeout: 10 });
  client = drizzle(sql);
  return client;
}

/** Run one MCP operation with a transaction-local tenant scope for RLS. */
export function withMcpClinic<T>(clinicId: string, work: (db: McpQueryDb) => Promise<T>): Promise<T> {
  return mcpDatabase().transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.mcp_clinic_id', ${clinicId}, true)`);
    return work(tx);
  });
}

/** Look up a bearer token before its clinic is known; RLS exposes only that hash. */
export function withMcpTokenHash<T>(tokenHash: string, work: (db: McpQueryDb) => Promise<T>): Promise<T> {
  return mcpDatabase().transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.mcp_token_hash', ${tokenHash}, true)`);
    return work(tx);
  });
}
