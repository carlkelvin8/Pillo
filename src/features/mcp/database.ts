import postgres from "postgres";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { serverEnv } from "@/lib/env-server";

let client: PostgresJsDatabase | undefined;

/** Server-only Drizzle client for stateless MCP requests. */
export function mcpDatabase(): PostgresJsDatabase {
  if (client) return client;
  const url = serverEnv().DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const sql = postgres(url, { prepare: false, max: 2, idle_timeout: 20, connect_timeout: 10 });
  client = drizzle(sql);
  return client;
}
