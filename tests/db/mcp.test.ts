import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addMember, admin, asUser, asUserCommitted, createClinic, createUser, failure, uniqueEmail } from "./helpers";

let clinic = "";
const users = { owner: "", receptionist: "", doctor: "" };

beforeAll(async () => {
  users.owner = await createUser(uniqueEmail("mcp-owner"));
  users.receptionist = await createUser(uniqueEmail("mcp-receptionist"));
  users.doctor = await createUser(uniqueEmail("mcp-doctor"));
  clinic = await createClinic(users.owner, "MCP Clinic");
  await addMember(clinic, users.receptionist, "receptionist");
  await addMember(clinic, users.doctor, "doctor");
});

afterAll(async () => { await admin.end(); });

describe("MCP tokens", () => {
  it("allows owner management but never permits reading the token hash", async () => {
    const tokenId = await asUserCommitted(users.owner, async (tx) => {
      const [row] = await tx<{ id: string }[]>`
        insert into public.mcp_tokens (clinic_id, name, token_hash, scopes)
        values (${clinic}, 'Reporting client', ${"a".repeat(64)}, ${["daily_summary:read"]}) returning id`;
      return row!.id;
    });
    await asUser(users.owner, async (tx) => {
      expect(await tx`select id, name, scopes from public.mcp_tokens where id=${tokenId}`).toHaveLength(1);
    });
    const secret = await failure(users.owner, (tx) => tx`select token_hash from public.mcp_tokens where id=${tokenId}`);
    expect(secret.code).toBe("42501");
    const denied = await failure(users.receptionist, (tx) => tx`insert into public.mcp_tokens (clinic_id, name, token_hash) values (${clinic}, 'No', ${"b".repeat(64)})`);
    expect(denied.code).toBe("42501");
  });

  it("rejects unrecognized scopes", async () => {
    const invalid = await failure(users.owner, (tx) => tx`
      insert into public.mcp_tokens (clinic_id, name, token_hash, scopes)
      values (${clinic}, 'Invalid scope', ${"c".repeat(64)}, ${["payments:send"]})`);
    expect(invalid.code).toBe("23514");
  });
});

describe("MCP payment request approvals", () => {
  it("allows a receptionist to decide a proposal but prevents doctors from doing so", async () => {
    const [row] = await admin<{ id: string }[]>`
      insert into public.agent_actions (clinic_id, kind, status, autonomy, payload)
      values (${clinic}, 'mcp_request_payment', 'proposed', 'approve', '{}'::jsonb) returning id`;
    await asUserCommitted(users.receptionist, (tx) => tx`
      select public.decide_mcp_payment_request(${row!.id}, true)`);
    const [other] = await admin<{ id: string }[]>`
      insert into public.agent_actions (clinic_id, kind, status, autonomy, payload)
      values (${clinic}, 'mcp_request_payment', 'proposed', 'approve', '{}'::jsonb) returning id`;
    const denied = await failure(users.doctor, (tx) => tx`
      select public.decide_mcp_payment_request(${other!.id}, true)`);
    expect(denied.code).toBe("42501");
  });

  it("allows only one staff member to claim an approval under concurrent clicks", async () => {
    const [row] = await admin<{ id: string }[]>`
      insert into public.agent_actions (clinic_id, kind, status, autonomy, payload)
      values (${clinic}, 'mcp_request_payment', 'proposed', 'approve', '{}'::jsonb) returning id`;
    const decisions = await Promise.allSettled([
      asUserCommitted(users.owner, (tx) => tx`select public.decide_mcp_payment_request(${row!.id}, true)`),
      asUserCommitted(users.receptionist, (tx) => tx`select public.decide_mcp_payment_request(${row!.id}, true)`),
    ]);
    expect(decisions.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(decisions.filter((result) => result.status === "rejected")).toHaveLength(1);
  });

  it("records a failed link after approval without exposing details", async () => {
    const [row] = await admin<{ id: string }[]>`
      insert into public.agent_actions (clinic_id, kind, status, autonomy, payload)
      values (${clinic}, 'mcp_request_payment', 'proposed', 'approve', '{}'::jsonb) returning id`;
    await asUserCommitted(users.receptionist, (tx) => tx`
      select public.decide_mcp_payment_request(${row!.id}, true)`);
    await asUserCommitted(users.receptionist, (tx) => tx`
      select public.fail_mcp_payment_request(${row!.id})`);
    const [result] = await admin<{ status: string; outcome: string }[]>`
      select status, outcome from public.agent_actions where id=${row!.id}`;
    expect(result).toEqual({ status: "failed", outcome: "Payment link creation failed after staff approval." });
  });

  it("allows only an authorized staff member to record a payment-link failure", async () => {
    const [row] = await admin<{ id: string }[]>`
      insert into public.agent_actions (clinic_id, kind, status, autonomy, payload)
      values (${clinic}, 'mcp_request_payment', 'approved', 'approve', '{}'::jsonb) returning id`;
    const denied = await failure(users.doctor, (tx) => tx`
      select public.fail_mcp_payment_request(${row!.id})`);
    expect(denied.code).toBe("42501");

    const otherOwner = await createUser(uniqueEmail("mcp-other-owner"));
    const otherReceptionist = await createUser(uniqueEmail("mcp-other-receptionist"));
    const otherClinic = await createClinic(otherOwner, "Other MCP Clinic");
    await addMember(otherClinic, otherReceptionist, "receptionist");
    const crossTenant = await failure(otherReceptionist, (tx) => tx`
      select public.fail_mcp_payment_request(${row!.id})`);
    expect(crossTenant.code).toBe("42501");
  });
});
