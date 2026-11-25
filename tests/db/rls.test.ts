import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  addMember,
  admin,
  asAnon,
  asUser,
  asUserCommitted,
  createClinic,
  createUser,
  failure,
  uniqueEmail,
} from "./helpers";

// Two separate clinics (tenants) with one user per role in clinic A.
let clinicA = "";
let clinicB = "";
const u = { ownerA: "", doctorA: "", recepA: "", billingA: "", ownerB: "", stranger: "" };

beforeAll(async () => {
  u.ownerA = await createUser(uniqueEmail("owner-a"), { fullName: "Owner A" });
  u.doctorA = await createUser(uniqueEmail("doctor-a"));
  u.recepA = await createUser(uniqueEmail("recep-a"));
  u.billingA = await createUser(uniqueEmail("billing-a"));
  u.ownerB = await createUser(uniqueEmail("owner-b"));
  u.stranger = await createUser(uniqueEmail("stranger"));

  clinicA = await createClinic(u.ownerA, "Clinic A");
  clinicB = await createClinic(u.ownerB, "Clinic B");
  await addMember(clinicA, u.doctorA, "doctor");
  await addMember(clinicA, u.recepA, "receptionist");
  await addMember(clinicA, u.billingA, "billing");
});

afterAll(async () => {
  await admin.end();
});

describe("anonymous access", () => {
  it("cannot read any tenant table", async () => {
    for (const table of ["clinics", "memberships", "profiles", "invitations", "audit_log"]) {
      const err = await failure(null, (tx) => tx.unsafe(`select * from public.${table}`));
      expect(err.code, table).toBe("42501");
    }
  });

  it("cannot call the RPCs", async () => {
    const err = await failure(null, (tx) => tx`select public.create_clinic('x')`);
    expect(err.code).toBe("42501");
    const err2 = await failure(null, (tx) => tx`select public.accept_pending_invitations()`);
    expect(err2.code).toBe("42501");
  });
});

describe("tenant isolation", () => {
  it("a user with no membership sees nothing", async () => {
    await asUser(u.stranger, async (tx) => {
      expect(await tx`select id from public.clinics`).toHaveLength(0);
      expect(await tx`select id from public.memberships`).toHaveLength(0);
      expect(await tx`select id from public.audit_log`).toHaveLength(0);
    });
  });

  it("members only see their own clinic and its memberships", async () => {
    await asUser(u.doctorA, async (tx) => {
      const clinics = await tx<{ id: string }[]>`select id from public.clinics`;
      expect(clinics.map((c) => c.id)).toEqual([clinicA]);
      const members = await tx<{ clinic_id: string }[]>`select clinic_id from public.memberships`;
      expect(members).toHaveLength(4);
      expect(members.every((m) => m.clinic_id === clinicA)).toBe(true);
    });
  });

  it("cannot read another clinic by id", async () => {
    await asUser(u.ownerA, async (tx) => {
      expect(await tx`select id from public.clinics where id = ${clinicB}`).toHaveLength(0);
    });
  });

  it("cannot update another clinic (0 rows, no error)", async () => {
    await asUser(u.ownerA, async (tx) => {
      const rows =
        await tx`update public.clinics set name = 'pwned' where id = ${clinicB} returning id`;
      expect(rows).toHaveLength(0);
    });
    const [b] = await admin<
      { name: string }[]
    >`select name from public.clinics where id = ${clinicB}`;
    expect(b?.name).toBe("Clinic B");
  });

  it("cannot log audit entries into another clinic", async () => {
    const err = await failure(
      u.ownerA,
      (tx) => tx`select public.log_audit(${clinicB}, 'x.y', 'thing')`,
    );
    expect(err.code).toBe("42501");
  });

  it("only sees profiles of people it shares a clinic with", async () => {
    await asUser(u.doctorA, async (tx) => {
      const ids = (await tx<{ id: string }[]>`select id from public.profiles`).map((p) => p.id);
      expect(ids).toContain(u.ownerA);
      expect(ids).toContain(u.doctorA);
      expect(ids).not.toContain(u.ownerB);
      expect(ids).not.toContain(u.stranger);
    });
  });
});

describe("clinics", () => {
  it("lets only the clinic's owner update its public website", async () => {
    const website = "https://www.facebook.com/sampleclinic";
    for (const user of [u.recepA, u.ownerB]) {
      await asUser(user, async (tx) => {
        expect(
          await tx`update public.clinics set website_url = ${website}
          where id = ${clinicA} returning website_url`,
        ).toHaveLength(0);
      });
    }
    await asUser(u.ownerA, async (tx) => {
      expect(
        await tx`update public.clinics set website_url = ${website}
        where id = ${clinicA} returning website_url`,
      ).toEqual([{ website_url: website }]);
      expect(
        await tx`update public.clinics set website_url = null
        where id = ${clinicA} returning website_url`,
      ).toEqual([{ website_url: null }]);
    });
    const err = await failure(null, (tx) => tx`select website_url from public.clinics`);
    expect(err.code).toBe("42501");
  });

  it("rejects non-web public links even when sent directly to the database", async () => {
    const error = await failure(
      u.ownerA,
      (tx) => tx`
      update public.clinics set website_url = 'javascript:alert(1)' where id = ${clinicA}`,
    );
    expect(error.code).toBe("23514");
  });

  it("cannot be inserted or deleted directly", async () => {
    const ins = await failure(
      u.stranger,
      (tx) => tx`insert into public.clinics (name) values ('direct')`,
    );
    expect(ins.code).toBe("42501");
    const del = await failure(
      u.ownerA,
      (tx) => tx`delete from public.clinics where id = ${clinicA}`,
    );
    expect(del.code).toBe("42501");
  });

  it("create_clinic makes the caller the owner and writes an audit entry", async () => {
    const user = await createUser(uniqueEmail("founder"));
    const id = await createClinic(user, "  Founder Clinic  ");
    const [m] = await admin<{ role: string }[]>`
      select role from public.memberships where clinic_id = ${id} and user_id = ${user}`;
    expect(m?.role).toBe("owner");
    const [c] = await admin<{ name: string }[]>`select name from public.clinics where id = ${id}`;
    expect(c?.name).toBe("Founder Clinic");
    const log =
      await admin`select 1 from public.audit_log where clinic_id = ${id} and action = 'clinic.created'`;
    expect(log).toHaveLength(1);
  });

  it("create_clinic requires a confirmed email", async () => {
    const user = await createUser(uniqueEmail("unconfirmed"), { confirmed: false });
    const err = await failure(user, (tx) => tx`select public.create_clinic('Nope')`);
    expect(err.code).toBe("42501");
  });

  it("create_clinic rejects blank names", async () => {
    const user = await createUser(uniqueEmail("blank"));
    const err = await failure(user, (tx) => tx`select public.create_clinic('   ')`);
    expect(err.code).toBe("23514");
  });

  it("only owners can update; others change 0 rows", async () => {
    for (const who of [u.doctorA, u.recepA, u.billingA]) {
      await asUser(who, async (tx) => {
        const rows =
          await tx`update public.clinics set name = 'x' where id = ${clinicA} returning id`;
        expect(rows).toHaveLength(0);
      });
    }
    await asUser(u.ownerA, async (tx) => {
      const rows =
        await tx`update public.clinics set phone = '0917' where id = ${clinicA} returning id`;
      expect(rows).toHaveLength(1);
    });
  });

  it("owners cannot rewrite protected columns", async () => {
    const err = await failure(
      u.ownerA,
      (tx) => tx`update public.clinics set id = gen_random_uuid() where id = ${clinicA}`,
    );
    expect(err.code).toBe("42501");
  });
});

describe("memberships", () => {
  it("cannot be inserted by clients (no self-join into another clinic)", async () => {
    const err = await failure(
      u.stranger,
      (tx) =>
        tx`insert into public.memberships (clinic_id, user_id, role) values (${clinicA}, ${u.stranger}, 'owner')`,
    );
    expect(err.code).toBe("42501");
  });

  it("only owners can change roles", async () => {
    await asUser(u.recepA, async (tx) => {
      const rows = await tx`
        update public.memberships set role = 'owner' where clinic_id = ${clinicA} and user_id = ${u.recepA} returning id`;
      expect(rows).toHaveLength(0);
    });
    await asUser(u.ownerA, async (tx) => {
      const rows = await tx`
        update public.memberships set role = 'billing' where clinic_id = ${clinicA} and user_id = ${u.recepA} returning id`;
      expect(rows).toHaveLength(1);
    });
  });

  it("only the role column is updatable", async () => {
    const err = await failure(
      u.ownerA,
      (tx) => tx`update public.memberships set clinic_id = ${clinicB} where user_id = ${u.doctorA}`,
    );
    expect(err.code).toBe("42501");
  });

  it("the last owner cannot be demoted or removed", async () => {
    const demote = await failure(
      u.ownerA,
      (tx) =>
        tx`update public.memberships set role = 'doctor' where clinic_id = ${clinicA} and user_id = ${u.ownerA}`,
    );
    expect(demote.message).toMatch(/at least one owner/);
    const leave = await failure(
      u.ownerA,
      (tx) =>
        tx`delete from public.memberships where clinic_id = ${clinicA} and user_id = ${u.ownerA}`,
    );
    expect(leave.message).toMatch(/at least one owner/);
  });

  it("a second owner lets the first owner step down", async () => {
    await asUser(u.ownerA, async (tx) => {
      await tx`update public.memberships set role = 'owner' where clinic_id = ${clinicA} and user_id = ${u.doctorA}`;
      const rows = await tx`
        update public.memberships set role = 'doctor' where clinic_id = ${clinicA} and user_id = ${u.ownerA} returning id`;
      expect(rows).toHaveLength(1);
    });
  });

  it("members can leave a clinic but cannot remove others", async () => {
    await asUser(u.recepA, async (tx) => {
      const others =
        await tx`delete from public.memberships where clinic_id = ${clinicA} and user_id = ${u.doctorA} returning id`;
      expect(others).toHaveLength(0);
      const self =
        await tx`delete from public.memberships where clinic_id = ${clinicA} and user_id = ${u.recepA} returning id`;
      expect(self).toHaveLength(1);
    });
  });
});

describe("invitations", () => {
  const invite = (clinic: string, email: string, by: string, role = "doctor") =>
    asUser(
      by,
      (tx) => tx`
      insert into public.invitations (clinic_id, email, role, invited_by)
      values (${clinic}, ${email}, ${role}::public.app_role, ${by}) returning id`,
    );

  it("owners can invite; non-owners cannot", async () => {
    expect(await invite(clinicA, uniqueEmail("new"), u.ownerA)).toHaveLength(1);
    const err = await failure(
      u.recepA,
      (tx) => tx`insert into public.invitations (clinic_id, email, role, invited_by)
                 values (${clinicA}, ${uniqueEmail("x")}, 'doctor', ${u.recepA})`,
    );
    expect(err.code).toBe("42501");
  });

  it("an owner of clinic B cannot invite into clinic A", async () => {
    const err = await failure(
      u.ownerB,
      (tx) => tx`insert into public.invitations (clinic_id, email, role, invited_by)
                 values (${clinicA}, ${uniqueEmail("x")}, 'doctor', ${u.ownerB})`,
    );
    expect(err.code).toBe("42501");
  });

  it("cannot invite as someone else or invite an owner", async () => {
    const spoof = await failure(
      u.ownerA,
      (tx) => tx`insert into public.invitations (clinic_id, email, role, invited_by)
                 values (${clinicA}, ${uniqueEmail("x")}, 'doctor', ${u.ownerB})`,
    );
    expect(spoof.code).toBe("42501");
    const asOwner = await failure(
      u.ownerA,
      (tx) => tx`insert into public.invitations (clinic_id, email, role, invited_by)
                 values (${clinicA}, ${uniqueEmail("x")}, 'owner', ${u.ownerA})`,
    );
    expect(asOwner.code).toBe("23514");
  });

  it("only owners can read invitations", async () => {
    const email = uniqueEmail("visible");
    await admin`insert into public.invitations (clinic_id, email, role) values (${clinicA}, ${email}, 'billing')`;
    await asUser(u.doctorA, async (tx) => {
      expect(await tx`select 1 from public.invitations`).toHaveLength(0);
    });
    await asUser(u.ownerA, async (tx) => {
      const rows = await tx`select 1 from public.invitations where email = ${email}`;
      expect(rows).toHaveLength(1);
    });
  });

  it("rejects a second open invitation for the same email", async () => {
    const email = uniqueEmail("dupe");
    await admin`insert into public.invitations (clinic_id, email, role) values (${clinicA}, ${email}, 'billing')`;
    const err = await failure(
      u.ownerA,
      (tx) => tx`insert into public.invitations (clinic_id, email, role, invited_by)
                 values (${clinicA}, ${email}, 'doctor', ${u.ownerA})`,
    );
    expect(err.code).toBe("23505");
  });

  it("accept_pending_invitations joins the clinic with the invited role", async () => {
    const email = uniqueEmail("joiner");
    const joiner = await createUser(email);
    await admin`insert into public.invitations (clinic_id, email, role) values (${clinicA}, ${email}, 'receptionist')`;
    await asUserCommitted(joiner, async (tx) => {
      const [r] = await tx<{ n: number }[]>`select public.accept_pending_invitations() as n`;
      expect(r?.n).toBe(1);
    });
    const [m] = await admin<{ role: string }[]>`
      select role from public.memberships where clinic_id = ${clinicA} and user_id = ${joiner}`;
    expect(m?.role).toBe("receptionist");
    const open =
      await admin`select 1 from public.invitations where email = ${email} and accepted_at is null`;
    expect(open).toHaveLength(0);
  });

  it("does not accept for an unconfirmed email", async () => {
    const email = uniqueEmail("squatter");
    const squatter = await createUser(email, { confirmed: false });
    await admin`insert into public.invitations (clinic_id, email, role) values (${clinicA}, ${email}, 'billing')`;
    await asUser(squatter, async (tx) => {
      const [r] = await tx<{ n: number }[]>`select public.accept_pending_invitations() as n`;
      expect(r?.n).toBe(0);
    });
    const m = await admin`select 1 from public.memberships where user_id = ${squatter}`;
    expect(m).toHaveLength(0);
  });

  it("ignores revoked and expired invitations", async () => {
    const email = uniqueEmail("late");
    const late = await createUser(email);
    await admin`insert into public.invitations (clinic_id, email, role, revoked_at) values (${clinicA}, ${email}, 'billing', now())`;
    await admin`insert into public.invitations (clinic_id, email, role, expires_at) values (${clinicB}, ${email}, 'billing', now() - interval '1 day')`;
    await asUser(late, async (tx) => {
      const [r] = await tx<{ n: number }[]>`select public.accept_pending_invitations() as n`;
      expect(r?.n).toBe(0);
    });
  });

  it("owners can revoke but not edit other columns", async () => {
    const email = uniqueEmail("revokeme");
    const [inv] = await admin<{ id: string }[]>`
      insert into public.invitations (clinic_id, email, role) values (${clinicA}, ${email}, 'billing') returning id`;
    const err = await failure(
      u.ownerA,
      (tx) => tx`update public.invitations set role = 'doctor' where id = ${inv?.id ?? ""}`,
    );
    expect(err.code).toBe("42501");
    await asUser(u.ownerA, async (tx) => {
      const rows =
        await tx`update public.invitations set revoked_at = now() where id = ${inv?.id ?? ""} returning id`;
      expect(rows).toHaveLength(1);
    });
  });
});

describe("audit_log", () => {
  it("members can append through log_audit; entries record the actor", async () => {
    await asUserCommitted(u.recepA, async (tx) => {
      await tx`select public.log_audit(${clinicA}, 'patient.viewed', 'patient', null, '{"via":"test"}'::jsonb)`;
    });
    const rows = await admin<{ actor_id: string }[]>`
      select actor_id from public.audit_log where clinic_id = ${clinicA} and action = 'patient.viewed'`;
    expect(rows.every((r) => r.actor_id === u.recepA)).toBe(true);
    expect(rows.length).toBeGreaterThan(0);
  });

  it("clients cannot insert, update or delete directly", async () => {
    const ins = await failure(
      u.ownerA,
      (tx) =>
        tx`insert into public.audit_log (clinic_id, action, entity) values (${clinicA}, 'forged', 'x')`,
    );
    expect(ins.code).toBe("42501");
    const upd = await failure(u.ownerA, (tx) => tx`update public.audit_log set action = 'edited'`);
    expect(upd.code).toBe("42501");
    const del = await failure(u.ownerA, (tx) => tx`delete from public.audit_log`);
    expect(del.code).toBe("42501");
  });

  it("only owners can read the log, and only their own clinic's", async () => {
    await asUser(u.doctorA, async (tx) => {
      expect(await tx`select 1 from public.audit_log`).toHaveLength(0);
    });
    await asUser(u.ownerB, async (tx) => {
      const rows = await tx<{ clinic_id: string }[]>`select clinic_id from public.audit_log`;
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.every((r) => r.clinic_id === clinicB)).toBe(true);
    });
  });
});

describe("profiles", () => {
  it("users can edit only their own full_name", async () => {
    await asUser(u.doctorA, async (tx) => {
      const own =
        await tx`update public.profiles set full_name = 'Dr A' where id = ${u.doctorA} returning id`;
      expect(own).toHaveLength(1);
      const other =
        await tx`update public.profiles set full_name = 'hax' where id = ${u.ownerA} returning id`;
      expect(other).toHaveLength(0);
    });
    const err = await failure(
      u.doctorA,
      (tx) => tx`update public.profiles set email = 'x@y.z' where id = ${u.doctorA}`,
    );
    expect(err.code).toBe("42501");
  });

  it("is created automatically with the signup name", async () => {
    const [p] = await admin<{ full_name: string | null }[]>`
      select full_name from public.profiles where id = ${u.ownerA}`;
    expect(p?.full_name).toBe("Owner A");
  });
});

// Keep the unused helper import honest if anon helpers change.
void asAnon;
