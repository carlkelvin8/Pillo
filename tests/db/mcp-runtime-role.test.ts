import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addMember, admin, asMcpRuntime, asUser, createClinic, createUser, uniqueEmail } from "./helpers";

let clinic = "";
let other = "";
let patient = "";
let doctor = "";
let branch = "";
let owner = "";
let tokenId = "";

beforeAll(async () => {
  owner = await createUser(uniqueEmail("rt-owner"));
  const docUser = await createUser(uniqueEmail("rt-doc"));
  clinic = await createClinic(owner, "Runtime Clinic");
  other = await createClinic(await createUser(uniqueEmail("rt-other")), "Other Clinic");
  await addMember(clinic, docUser, "doctor");
  const [p] = await admin<{ id: string }[]>`insert into public.patients (clinic_id, full_name) values (${clinic}, 'Runtime Patient') returning id`;
  patient = p!.id;
  const [d] = await admin<{ id: string }[]>`select id from public.doctors where clinic_id = ${clinic} limit 1`;
  doctor = d!.id;
  const [b] = await admin<{ id: string }[]>`select id from public.branches where clinic_id = ${clinic} limit 1`;
  branch = b!.id;
  const [t] = await admin<{ id: string }[]>`
    insert into public.mcp_tokens (clinic_id, name, token_hash, scopes, created_by)
    values (${clinic}, 'rt', ${"b".repeat(64)}, ${["appointments:write"]}, ${owner}) returning id`;
  tokenId = t!.id;
});

afterAll(async () => {
  await admin.end();
});

describe("MCP token expiry", () => {
  it("defaults to about 90 days and is stored for every token", async () => {
    const [row] = await admin<{ days: number }[]>`
      select extract(day from expires_at - created_at)::int as days from public.mcp_tokens where id = ${tokenId}`;
    expect(row?.days).toBeGreaterThanOrEqual(89);
    expect(row?.days).toBeLessThanOrEqual(90);
  });

  it("rejects an expiry beyond 366 days or before creation", async () => {
    await expect(
      admin`insert into public.mcp_tokens (clinic_id, name, token_hash, created_by, expires_at)
            values (${clinic}, 'long', ${"c".repeat(64)}, ${owner}, now() + interval '400 days')`,
    ).rejects.toMatchObject({ code: "23514" });
    await expect(
      admin`insert into public.mcp_tokens (clinic_id, name, token_hash, created_by, expires_at)
            values (${clinic}, 'past', ${"d".repeat(64)}, ${owner}, now() - interval '1 day')`,
    ).rejects.toMatchObject({ code: "23514" });
  });

  it("lets an owner choose the expiry when creating a token", async () => {
    const rows = await asUser(
      owner,
      (tx) => tx`insert into public.mcp_tokens (clinic_id, name, token_hash, scopes, expires_at)
                 values (${clinic}, 'owner-choice', ${"e".repeat(64)}, ${["daily_summary:read"]}, now() + interval '30 days')
                 returning id`,
    );
    expect(rows).toHaveLength(1);
  });
});

describe("pillo_mcp role: allowed statements (everything src/features/mcp issues)", () => {
  it("authenticates a token and stamps last_used_at", async () => {
    await asMcpRuntime(async (tx) => {
      const rows = await tx`select id, clinic_id, scopes, expires_at from public.mcp_tokens where token_hash = ${"b".repeat(64)} and revoked_at is null and expires_at > now()`;
      expect(rows).toHaveLength(1);
      const upd = await tx`update public.mcp_tokens set last_used_at = now() where id = ${tokenId} and clinic_id = ${clinic} returning id`;
      expect(upd).toHaveLength(1);
    }, { clinicId: clinic, tokenHash: "b".repeat(64) });
  });

  it("reads schedule, clinic and patient data it exposes", async () => {
    await asMcpRuntime(async (tx) => {
      await tx`select timezone from public.clinics where id = ${clinic}`;
      await tx`select weekday, opens_at, closes_at from public.clinic_hours where clinic_id = ${clinic}`;
      await tx`select weekday, starts_at, ends_at from public.doctor_hours where clinic_id = ${clinic}`;
      await tx`select id, starts_at, ends_at, status, doctor_id, branch_id from public.appointments where clinic_id = ${clinic}`;
      const rows = await tx`select id, patient_number, full_name, birthdate, sex, phone, email from public.patients where clinic_id = ${clinic}`;
      expect(rows).toHaveLength(1);
      await tx`select coalesce(sum(amount_centavos),0)::bigint from public.payments where clinic_id = ${clinic} and status = 'succeeded' and paid_at >= now() - interval '1 day'`;
      await tx`select status, count(*)::int from public.invoices where clinic_id = ${clinic} group by status`;
    }, { clinicId: clinic });
  });

  it("cannot read another clinic's rows", async () => {
    const crossClinic = await asMcpRuntime(
      (tx) => tx`select id from public.clinics where id = ${other}`,
      { clinicId: clinic },
    );
    expect(crossClinic).toHaveLength(0);
  });

  it("cannot write rows for another clinic", async () => {
    await expect(
      asMcpRuntime((tx) => tx`
        insert into public.agent_actions (clinic_id, kind, status, autonomy, payload, outcome)
        values (${other}, 'mcp_request_payment', 'proposed', 'approve', '{}'::jsonb, 'Waiting')
      `, { clinicId: clinic }),
    ).rejects.toMatchObject({ code: "42501" });
  });

  it("cannot select other agent_actions columns such as payload", async () => {
    await expect(
      asMcpRuntime((tx) => tx`select payload from public.agent_actions where clinic_id = ${clinic}`, { clinicId: clinic }),
    ).rejects.toMatchObject({ code: "42501" });
    await expect(
      asMcpRuntime((tx) => tx`select * from public.agent_actions where clinic_id = ${clinic}`, { clinicId: clinic }),
    ).rejects.toMatchObject({ code: "42501" });
  });

  it("cannot read appointment reason", async () => {
    await expect(
      asMcpRuntime((tx) => tx`select reason from public.appointments where clinic_id = ${clinic}`, { clinicId: clinic }),
    ).rejects.toMatchObject({ code: "42501" });
  });

  it("books and reschedules an appointment", async () => {
    await asMcpRuntime(async (tx) => {
      const [row] = await tx<{ id: string }[]>`
        insert into public.appointments (clinic_id, patient_id, doctor_id, branch_id, starts_at, ends_at, status, source)
        values (${clinic}, ${patient}, ${doctor}, ${branch}, now() + interval '2 days', now() + interval '2 days 30 minutes', 'scheduled', 'ai')
        returning id`;
      const moved = await tx`update public.appointments set starts_at = now() + interval '3 days', ends_at = now() + interval '3 days 30 minutes'
                             where clinic_id = ${clinic} and id = ${row!.id} returning id`;
      expect(moved).toHaveLength(1);
    }, { clinicId: clinic });
  });

  it("creates a draft invoice with items (totals derived by triggers) and a payment request", async () => {
    await asMcpRuntime(async (tx) => {
      const [inv] = await tx<{ id: string }[]>`insert into public.invoices (clinic_id, patient_id, due_on) values (${clinic}, ${patient}, current_date + 7) returning id`;
      await tx`insert into public.invoice_items (clinic_id, invoice_id, position, description, quantity, unit_price_centavos)
               values (${clinic}, ${inv!.id}, 0, 'Cleaning', 2, 50000)`;
      const [row] = await tx<{ total_centavos: string }[]>`select total_centavos from public.invoices where id = ${inv!.id} and clinic_id = ${clinic}`;
      expect(Number(row?.total_centavos)).toBe(100000);
      const [proposal] = await tx<{ id: string; status: string }[]>`
        insert into public.agent_actions (clinic_id, kind, status, autonomy, payload, outcome)
        values (${clinic}, 'mcp_request_payment', 'proposed', 'approve', jsonb_build_object('invoice_id', ${inv!.id}::text), 'Waiting for staff approval')
        returning id, status
      `;
      expect(proposal).toEqual({ id: expect.any(String), status: "proposed" });
    }, { clinicId: clinic });
  });

  it("writes the audit entry", async () => {
    await asMcpRuntime(async (tx) => {
      await tx`insert into public.audit_log (clinic_id, actor_type, action, entity, entity_id, meta)
               values (${clinic}, 'mcp', 'mcp.tool_called', 'mcp_token', ${tokenId}, jsonb_build_object('tool', 'x', 'outcome', 'success'))`;
    }, { clinicId: clinic });
  });
});

describe("pillo_mcp role: everything else is denied", () => {
  const denied = async (fn: Parameters<typeof asMcpRuntime>[0]) => {
    await expect(asMcpRuntime(fn)).rejects.toMatchObject({ code: expect.stringMatching(/^(42501|42P01)$/) });
  };

  it("cannot delete or truncate anything", async () => {
    await denied((tx) => tx`delete from public.appointments where clinic_id = ${clinic}`);
    await denied((tx) => tx`delete from public.mcp_tokens where id = ${tokenId}`);
    await denied((tx) => tx.unsafe("truncate public.patients"));
  });

  it("cannot read clinical, staff, auth or payment-secret data", async () => {
    await denied((tx) => tx`select * from public.visits`);
    await denied((tx) => tx`select * from public.prescriptions`);
    await denied((tx) => tx`select * from public.memberships`);
    await denied((tx) => tx`select * from auth.users`);
    await denied((tx) => tx`select checkout_url from public.payments`);
    await denied((tx) => tx`select * from public.conversations`);
  });

  it("cannot change invoices, payments, clinics or tokens beyond what it needs", async () => {
    await denied((tx) => tx`update public.invoices set status = 'paid' where clinic_id = ${clinic}`);
    await denied((tx) => tx`insert into public.payments (clinic_id, invoice_id, method, amount_centavos, status, provider) values (${clinic}, ${patient}, 'cash', 1, 'succeeded', 'manual')`);
    await denied((tx) => tx`update public.clinics set name = 'x' where id = ${clinic}`);
    await denied((tx) => tx`update public.mcp_tokens set scopes = '{}' where id = ${tokenId}`);
    await denied((tx) => tx`update public.mcp_tokens set expires_at = now() + interval '300 days' where id = ${tokenId}`);
    await denied((tx) => tx`update public.appointments set status = 'completed' where clinic_id = ${clinic}`);
  });

  it("cannot run DDL", async () => {
    await denied((tx) => tx.unsafe("create table public.pwn (id int)"));
  });

  it("cannot call privileged functions", async () => {
    await denied((tx) => tx.unsafe("select public.apply_provider_payment('p','e','r','l','cash',1,'x',now())"));
  });

  it("is not able to log in until an operator enables it", async () => {
    const [role] = await admin<{ rolcanlogin: boolean; rolsuper: boolean; rolbypassrls: boolean }[]>`
      select rolcanlogin, rolsuper, rolbypassrls from pg_roles where rolname = 'pillo_mcp'`;
    expect(role).toEqual({ rolcanlogin: false, rolsuper: false, rolbypassrls: false });
    expect(other).not.toBe(clinic);
  });
});
