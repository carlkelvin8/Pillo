import postgres from "postgres";

const url = process.env.TEST_DATABASE_URL;
if (!url) throw new Error("TEST_DATABASE_URL is not set. Run `pnpm test:db`.");

/** Superuser connection: bypasses RLS. Use for arranging fixtures only. */
export const admin = postgres(url, { max: 4, onnotice: () => {} });

export type Sql = postgres.TransactionSql;

/**
 * Run `fn` as an authenticated Supabase user (RLS applies). Always rolls back,
 * so tests never leak state and a failed statement cannot poison the next.
 */
export async function asUser<T>(userId: string, fn: (tx: Sql) => Promise<T>): Promise<T> {
  return runRolledBack("authenticated", { sub: userId, role: "authenticated" }, fn);
}

/** Like asUser but COMMITS, for tests that must inspect results as admin afterwards. */
export async function asUserCommitted<T>(userId: string, fn: (tx: Sql) => Promise<T>): Promise<T> {
  return admin.begin(async (tx) => {
    await tx.unsafe("set local role authenticated");
    await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: userId, role: "authenticated" })}, true)`;
    return fn(tx);
  }) as Promise<T>;
}

export async function asAnon<T>(fn: (tx: Sql) => Promise<T>): Promise<T> {
  return runRolledBack("anon", { role: "anon" }, fn);
}

class Rollback<T> extends Error {
  constructor(readonly value: T) {
    super("rollback");
  }
}

async function runRolledBack<T>(
  role: "authenticated" | "anon",
  claims: Record<string, string>,
  fn: (tx: Sql) => Promise<T>,
): Promise<T> {
  try {
    await admin.begin(async (tx) => {
      await tx.unsafe(`set local role ${role}`);
      await tx`select set_config('request.jwt.claims', ${JSON.stringify(claims)}, true)`;
      throw new Rollback(await fn(tx));
    });
  } catch (e) {
    if (e instanceof Rollback) return e.value as T;
    throw e;
  }
  throw new Error("unreachable");
}

/** Run a statement expected to fail; returns the Postgres error code + message. */
export async function failure(
  userId: string | null,
  fn: (tx: Sql) => Promise<unknown>,
): Promise<{ code?: string; message: string }> {
  try {
    await (userId ? asUser(userId, fn) : asAnon(fn));
  } catch (e) {
    const err = e as { code?: string; message?: string };
    return { code: err.code, message: err.message ?? String(e) };
  }
  throw new Error("Expected the statement to fail, but it succeeded");
}

export async function createUser(
  email: string,
  opts: { confirmed?: boolean; fullName?: string } = {},
): Promise<string> {
  const [row] = await admin<{ id: string }[]>`
    insert into auth.users (email, email_confirmed_at, raw_user_meta_data)
    values (${email}, ${opts.confirmed === false ? null : new Date()},
            ${admin.json({ full_name: opts.fullName ?? null })})
    returning id`;
  if (!row) throw new Error("user insert failed");
  return row.id;
}

/** Create a clinic through the real RPC as `ownerId`. */
export async function createClinic(ownerId: string, name: string): Promise<string> {
  const id = await admin.begin(async (tx) => {
    await tx.unsafe("set local role authenticated");
    await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: ownerId, role: "authenticated" })}, true)`;
    const [row] = await tx<{ id: string }[]>`select public.create_clinic(${name}) as id`;
    return row?.id;
  });
  if (!id) throw new Error("create_clinic failed");
  return id;
}

export async function addMember(
  clinicId: string,
  userId: string,
  role: "owner" | "doctor" | "receptionist" | "billing",
): Promise<void> {
  await admin`insert into public.memberships (clinic_id, user_id, role) values (${clinicId}, ${userId}, ${role})`;
}

export function uniqueEmail(label: string): string {
  return `${label}-${Math.random().toString(36).slice(2, 10)}@example.test`;
}
