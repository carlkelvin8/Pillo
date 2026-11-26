/**
 * Development-only QA seeder: creates (or repairs) the QA login accounts and a QA clinic.
 *
 *   pnpm seed:qa --yes
 *
 * Idempotent: safe to run again any time. It
 *  - creates qa.owner1 / qa.recep1 / qa.doc1 @example.com (email pre-confirmed) or resets their password,
 *  - reuses the owner's existing clinic, or creates "QA Dental Clinic" through create_clinic(),
 *  - adds the receptionist and doctor memberships and a doctor profile.
 *
 * The shared password lives in .env.local as QA_SEED_PASSWORD (gitignored, written with mode 0600). It is
 * generated on the first run and never printed. Never run this against a production project: the script
 * only accepts a local Supabase URL (localhost, 127.0.0.1, [::1]) unless QA_SEED_ALLOW_HOST is set to
 * exactly the URL's host (e.g. QA_SEED_ALLOW_HOST=abcd.supabase.co) for a dedicated QA project.
 * For sample appointments/invoices, run scripts/seed-qa-dashboard-trends.sql afterwards.
 */
import { randomBytes } from "node:crypto";
import { appendFileSync, chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const ENV_FILE = ".env.local";
if (existsSync(ENV_FILE)) process.loadEnvFile(ENV_FILE);

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

function fail(message: string): never {
  console.error(`seed:qa: ${message}`);
  process.exit(1);
}

if (!process.argv.includes("--yes")) {
  fail(`this writes test users into ${url ?? "your Supabase project"}. Re-run with --yes (QA/dev projects only).`);
}
if (process.env.NODE_ENV === "production") fail("refusing to run with NODE_ENV=production.");
if (!url || !anonKey || !serviceKey) fail("missing Supabase variables in .env.local.");

let parsedUrl: URL;
try {
  parsedUrl = new URL(url);
} catch {
  fail("NEXT_PUBLIC_SUPABASE_URL is not a valid URL.");
}
const LOCAL_HOSTS = ["localhost", "127.0.0.1", "[::1]"];
if (!LOCAL_HOSTS.includes(parsedUrl.hostname) && process.env.QA_SEED_ALLOW_HOST !== parsedUrl.host) {
  fail(
    `refusing to seed ${parsedUrl.host}: it is not a local Supabase. If it is a dedicated QA project, ` +
      `set QA_SEED_ALLOW_HOST to exactly "${parsedUrl.host}" and re-run.`,
  );
}

let password = process.env.QA_SEED_PASSWORD;
if (!password) {
  password = randomBytes(12).toString("base64url");
  const emptyLine = /^QA_SEED_PASSWORD=\s*$/m;
  const existing = existsSync(ENV_FILE) ? readFileSync(ENV_FILE, "utf8") : null;
  if (existing !== null && emptyLine.test(existing)) {
    writeFileSync(ENV_FILE, existing.replace(emptyLine, () => `QA_SEED_PASSWORD=${password}`), { mode: 0o600 });
  } else {
    appendFileSync(ENV_FILE, `\n# QA seeder login password (scripts/seed-qa.ts)\nQA_SEED_PASSWORD=${password}\n`, { mode: 0o600 });
  }
  chmodSync(ENV_FILE, 0o600);
  console.log(`Generated a QA password and saved it as QA_SEED_PASSWORD in ${ENV_FILE}.`);
}

const options = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(url, serviceKey, options);

const ACCOUNTS = [
  { email: "qa.owner1@example.com", name: "QA Owner", role: "owner" },
  { email: "qa.recep1@example.com", name: "QA Receptionist", role: "receptionist" },
  { email: "qa.doc1@example.com", name: "QA Doctor", role: "doctor" },
] as const;

async function findUserId(email: string): Promise<string | null> {
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) fail(`listUsers: ${error.message}`);
    const hit = data.users.find((u) => u.email?.toLowerCase() === email);
    if (hit) return hit.id;
    if (data.users.length < 200) return null;
  }
  return null;
}

async function ensureUser(email: string, name: string): Promise<string> {
  const existing = await findUserId(email);
  if (existing) {
    const { error } = await admin.auth.admin.updateUserById(existing, {
      password,
      email_confirm: true,
      user_metadata: { full_name: name },
    });
    if (error) fail(`update ${email}: ${error.message}`);
    return existing;
  }
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: name },
  });
  if (error || !data.user) fail(`create ${email}: ${error?.message ?? "no user"}`);
  return data.user.id;
}

async function main() {
  const ids = new Map<string, string>();
  for (const a of ACCOUNTS) ids.set(a.email, await ensureUser(a.email, a.name));
  const ownerId = ids.get(ACCOUNTS[0].email)!;

  // Reuse the owner's clinic if there is one; otherwise create it as the owner (RLS-safe path).
  const { data: owned, error: ownedError } = await admin
    .from("memberships")
    .select("clinic_id")
    .eq("user_id", ownerId)
    .eq("role", "owner")
    .order("created_at")
    .limit(1);
  if (ownedError) fail(`memberships lookup: ${ownedError.message}`);

  let clinicId = owned?.[0]?.clinic_id as string | undefined;
  if (!clinicId) {
    const asOwner = createClient(url!, anonKey!, options);
    const signIn = await asOwner.auth.signInWithPassword({ email: ACCOUNTS[0].email, password: password! });
    if (signIn.error) fail(`owner sign-in: ${signIn.error.message}`);
    const created = await asOwner.rpc("create_clinic", { p_name: "QA Dental Clinic" });
    if (created.error) fail(`create_clinic: ${created.error.message}`);
    clinicId = created.data as string;
    console.log("Created clinic: QA Dental Clinic");
  }

  for (const a of ACCOUNTS.slice(1)) {
    const { error } = await admin
      .from("memberships")
      .upsert({ clinic_id: clinicId, user_id: ids.get(a.email)!, role: a.role }, { onConflict: "clinic_id,user_id" });
    if (error) fail(`membership ${a.role}: ${error.message}`);
  }

  const doctorId = ids.get("qa.doc1@example.com")!;
  const { data: doctorMembership } = await admin
    .from("memberships")
    .select("id")
    .eq("clinic_id", clinicId)
    .eq("user_id", doctorId)
    .single();
  if (doctorMembership) {
    const { error } = await admin
      .from("doctors")
      .upsert(
        { clinic_id: clinicId, membership_id: doctorMembership.id, display_name: "QA Doctor" },
        { onConflict: "membership_id", ignoreDuplicates: true },
      );
    if (error) fail(`doctor profile: ${error.message}`);
  }

  console.log("QA accounts ready (password: QA_SEED_PASSWORD in .env.local):");
  for (const a of ACCOUNTS) console.log(`  ${a.role.padEnd(12)} ${a.email}`);
}

main().catch((error: unknown) => fail(error instanceof Error ? error.message : String(error)));
