#!/usr/bin/env bash
# Runs the RLS tests on a throwaway local Postgres (no Docker needed).
# Needs postgres/initdb/pg_ctl/psql on PATH (e.g. `brew install postgresql@14`).
set -euo pipefail
cd "$(dirname "$0")/.."

PORT="${TEST_DB_PORT:-54399}"
TMP="$(mktemp -d)"
cleanup() { pg_ctl -D "$TMP/data" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$TMP"; }
trap cleanup EXIT

initdb -D "$TMP/data" -U postgres --auth=trust -E UTF8 >/dev/null
pg_ctl -D "$TMP/data" -l "$TMP/pg.log" -o "-p $PORT -c listen_addresses=127.0.0.1 -c unix_socket_directories=$TMP" -w start >/dev/null

URL="postgres://postgres@127.0.0.1:$PORT/postgres"
psql "$URL" -v ON_ERROR_STOP=1 -q -f tests/db/supabase-stub.sql
for f in supabase/migrations/*.sql; do
  psql "$URL" -v ON_ERROR_STOP=1 -q -f "$f"
done

TEST_DATABASE_URL="$URL" pnpm exec vitest run -c vitest.db.config.ts "$@"
