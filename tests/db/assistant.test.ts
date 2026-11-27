import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  addMember,
  admin,
  asUser,
  asUserCommitted,
  createClinic,
  createUser,
  failure,
  uniqueEmail,
} from "./helpers";

let clinicA = "";
let clinicB = "";
let convA = "";
let convB = "";
const u = { ownerA: "", recepA: "", doctorA: "", billingA: "", ownerB: "" };

beforeAll(async () => {
  u.ownerA = await createUser(uniqueEmail("d-owner-a"));
  u.recepA = await createUser(uniqueEmail("d-recep-a"));
  u.doctorA = await createUser(uniqueEmail("d-doctor-a"));
  u.billingA = await createUser(uniqueEmail("d-billing-a"));
  u.ownerB = await createUser(uniqueEmail("d-owner-b"));
  clinicA = await createClinic(u.ownerA, "Assistant Clinic A");
  clinicB = await createClinic(u.ownerB, "Assistant Clinic B");
  await addMember(clinicA, u.recepA, "receptionist");
  await addMember(clinicA, u.doctorA, "doctor");
  await addMember(clinicA, u.billingA, "billing");
  // The server (service role) creates conversations and patient messages.
  const [a] = await admin<
    { id: string }[]
  >`insert into public.conversations (clinic_id, token_hash) values (${clinicA}, 'hash-a') returning id`;
  const [b] = await admin<
    { id: string }[]
  >`insert into public.conversations (clinic_id, token_hash) values (${clinicB}, 'hash-b') returning id`;
  convA = a?.id ?? "";
  convB = b?.id ?? "";
  await admin`insert into public.messages (clinic_id, conversation_id, role, content) values (${clinicA}, ${convA}, 'patient', 'Hello po')`;
});

afterAll(async () => {
  await admin.end();
});

describe("chat link", () => {
  it("every clinic gets a unique public slug that nobody can edit", async () => {
    const rows = await admin<
      { chat_slug: string }[]
    >`select chat_slug from public.clinics where id in (${clinicA}, ${clinicB})`;
    expect(new Set(rows.map((r) => r.chat_slug)).size).toBe(2);
    expect(rows.every((r) => r.chat_slug.length >= 8)).toBe(true);
    const err = await failure(
      u.ownerA,
      (tx) => tx`update public.clinics set chat_slug = 'hijack' where id = ${clinicA}`,
    );
    expect(err.code).toBe("42501");
  });
});

describe("conversations and messages", () => {
  it("owner and receptionist can read their clinic's inbox; others cannot", async () => {
    for (const who of [u.ownerA, u.recepA]) {
      await asUser(who, async (tx) => {
        const rows = await tx<{ id: string }[]>`select id from public.conversations`;
        expect(rows.map((r) => r.id)).toEqual([convA]);
        expect(await tx`select 1 from public.messages`).toHaveLength(1);
      });
    }
    for (const who of [u.doctorA, u.billingA, u.ownerB]) {
      await asUser(who, async (tx) => {
        const rows = await tx<
          { id: string }[]
        >`select id from public.conversations where clinic_id = ${clinicA}`;
        expect(rows).toHaveLength(0);
        expect(await tx`select 1 from public.messages where clinic_id = ${clinicA}`).toHaveLength(
          0,
        );
      });
    }
  });

  it("the token hash cannot be read by any client", async () => {
    const star = await failure(u.ownerA, (tx) => tx`select * from public.conversations`);
    expect(star.code).toBe("42501");
    const col = await failure(u.ownerA, (tx) => tx`select token_hash from public.conversations`);
    expect(col.code).toBe("42501");
  });

  it("clients cannot create or delete conversations", async () => {
    const ins = await failure(
      u.ownerA,
      (tx) => tx`insert into public.conversations (clinic_id, token_hash) values (${clinicA}, 'x')`,
    );
    expect(ins.code).toBe("42501");
    const del = await failure(
      u.ownerA,
      (tx) => tx`delete from public.conversations where id = ${convA}`,
    );
    expect(del.code).toBe("42501");
  });

  it("staff can reply only as staff, and the conversation timestamp follows", async () => {
    await asUserCommitted(
      u.recepA,
      (tx) =>
        tx`insert into public.messages (clinic_id, conversation_id, role, handled_by, content) values (${clinicA}, ${convA}, 'staff', 'human', 'Hi, ito si Ana.')`,
    );
    const [m] = await admin<
      { created_at: string }[]
    >`select created_at from public.messages where conversation_id = ${convA} and role = 'staff'`;
    const [c] = await admin<
      { last_message_at: string }[]
    >`select last_message_at from public.conversations where id = ${convA}`;
    expect(new Date(c?.last_message_at ?? 0).getTime()).toBe(
      new Date(m?.created_at ?? 1).getTime(),
    );

    const fake = await failure(
      u.recepA,
      (tx) =>
        tx`insert into public.messages (clinic_id, conversation_id, role, handled_by, content) values (${clinicA}, ${convA}, 'patient', null, 'forged patient message')`,
    );
    expect(fake.code).toBe("42501");
    const ai = await failure(
      u.recepA,
      (tx) =>
        tx`insert into public.messages (clinic_id, conversation_id, role, handled_by, content) values (${clinicA}, ${convA}, 'assistant', 'ai', 'forged AI message')`,
    );
    expect(ai.code).toBe("42501");
  });

  it("staff cannot write into another clinic's conversation", async () => {
    const err = await failure(
      u.ownerA,
      (tx) =>
        tx`insert into public.messages (clinic_id, conversation_id, role, handled_by, content) values (${clinicB}, ${convB}, 'staff', 'human', 'x')`,
    );
    expect(err.code).toBe("42501");
    const mismatch = await failure(
      u.ownerA,
      (tx) =>
        tx`insert into public.messages (clinic_id, conversation_id, role, handled_by, content) values (${clinicA}, ${convB}, 'staff', 'human', 'x')`,
    );
    expect(mismatch.code).toBe("23503");
  });

  it("staff can change status and hand a conversation back, but nothing else", async () => {
    await asUser(u.recepA, async (tx) => {
      const rows =
        await tx`update public.conversations set status = 'resolved', handled_by = 'ai' where id = ${convA} returning id`;
      expect(rows).toHaveLength(1);
    });
    const err = await failure(
      u.recepA,
      (tx) => tx`update public.conversations set handoff_reason = 'medical' where id = ${convA}`,
    );
    expect(err.code).toBe("42501");
    const other = await failure(
      u.ownerB,
      async (tx) => tx`update public.conversations set status = 'open' where id = ${convA}`,
    ).catch(() => null);
    void other;
    await asUser(u.ownerB, async (tx) => {
      expect(
        await tx`update public.conversations set status = 'open' where id = ${convA} returning id`,
      ).toHaveLength(0);
    });
  });

  it("server code can mark an emergency handoff; unknown reasons are rejected", async () => {
    const rows =
      await admin`update public.conversations set handoff_reason = 'emergency' where id = ${convA} returning handoff_reason`;
    expect(rows[0]?.handoff_reason).toBe("emergency");
    await expect(
      admin`update public.conversations set handoff_reason = 'panic' where id = ${convA}`,
    ).rejects.toMatchObject({ code: "23514" });
    await admin`update public.conversations set handoff_reason = null where id = ${convA}`;
  });

  it("rejects empty messages", async () => {
    const err = await failure(
      u.ownerA,
      (tx) =>
        tx`insert into public.messages (clinic_id, conversation_id, role, handled_by, content) values (${clinicA}, ${convA}, 'staff', 'human', '   ')`,
    );
    expect(err.code).toBe("23514");
  });
});

describe("agent log and rules", () => {
  it("owner and receptionist read the activity log; clients cannot write it", async () => {
    await admin`insert into public.agent_actions (clinic_id, conversation_id, kind, payload) values (${clinicA}, ${convA}, 'book_appointment', '{"appointment_id":"x"}'::jsonb)`;
    await asUser(u.recepA, async (tx) =>
      expect((await tx`select 1 from public.agent_actions`).length).toBeGreaterThan(0),
    );
    await asUser(u.doctorA, async (tx) =>
      expect(await tx`select 1 from public.agent_actions`).toHaveLength(0),
    );
    await asUser(u.ownerB, async (tx) =>
      expect(
        await tx`select 1 from public.agent_actions where clinic_id = ${clinicA}`,
      ).toHaveLength(0),
    );
    for (const sql of [
      `insert into public.agent_actions (clinic_id, kind) values ('${clinicA}', 'forged')`,
      `update public.agent_actions set status = 'rejected'`,
      `delete from public.agent_actions`,
    ]) {
      const err = await failure(u.ownerA, (tx) => tx.unsafe(sql));
      expect(err.code, sql).toBe("42501");
    }
  });

  it("only the owner reads and edits rules; limits are bounded", async () => {
    await asUserCommitted(
      u.ownerA,
      (tx) =>
        tx`insert into public.agent_rules (clinic_id, kind, autonomy, daily_limit) values (${clinicA}, 'book_appointment', 'suggest', 20)`,
    );
    await asUser(u.recepA, async (tx) =>
      expect(await tx`select 1 from public.agent_rules`).toHaveLength(0),
    );
    const denied = await failure(
      u.recepA,
      (tx) => tx`insert into public.agent_rules (clinic_id, kind) values (${clinicA}, 'reply')`,
    );
    expect(denied.code).toBe("42501");
    await asUser(u.ownerA, async (tx) => {
      expect(
        await tx`update public.agent_rules set daily_limit = 50 where clinic_id = ${clinicA} returning id`,
      ).toHaveLength(1);
    });
    const huge = await failure(
      u.ownerA,
      (tx) => tx`update public.agent_rules set daily_limit = 999999 where clinic_id = ${clinicA}`,
    );
    expect(huge.code).toBe("23514");
    const dupe = await failure(
      u.ownerA,
      (tx) =>
        tx`insert into public.agent_rules (clinic_id, kind) values (${clinicA}, 'book_appointment')`,
    );
    expect(dupe.code).toBe("23505");
    const cross = await failure(
      u.ownerB,
      (tx) => tx`insert into public.agent_rules (clinic_id, kind) values (${clinicA}, 'reply')`,
    );
    expect(cross.code).toBe("42501");
  });

  it("anonymous users cannot read anything", async () => {
    for (const t of ["conversations", "messages", "agent_actions", "agent_rules"]) {
      const err = await failure(null, (tx) => tx.unsafe(`select id from public.${t}`));
      expect(err.code, t).toBe("42501");
    }
  });
});
