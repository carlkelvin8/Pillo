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
let branchA = "";
let doctorA = "";
let patientA = "";
let patientB = "";
let wlA = "";
const u = { ownerA: "", recepA: "", doctorA: "", billingA: "", ownerB: "" };
const slot = (h: number) => new Date(Date.UTC(2027, 0, 14, h)).toISOString();

async function offer(by: string, hour: number) {
  return asUserCommitted(
    by,
    (tx) => tx<{ id: string }[]>`
    insert into public.slot_offers (clinic_id, branch_id, doctor_id, patient_id, waitlist_entry_id, starts_at, ends_at)
    values (${clinicA}, ${branchA}, ${doctorA}, ${patientA}, ${wlA}, ${slot(hour)}, ${slot(hour + 1)}) returning id`,
  );
}

beforeAll(async () => {
  u.ownerA = await createUser(uniqueEmail("c-owner-a"));
  u.recepA = await createUser(uniqueEmail("c-recep-a"));
  u.doctorA = await createUser(uniqueEmail("c-doctor-a"));
  u.billingA = await createUser(uniqueEmail("c-billing-a"));
  u.ownerB = await createUser(uniqueEmail("c-owner-b"));
  clinicA = await createClinic(u.ownerA, "Filler Clinic A");
  clinicB = await createClinic(u.ownerB, "Filler Clinic B");
  await addMember(clinicA, u.recepA, "receptionist");
  await addMember(clinicA, u.doctorA, "doctor");
  await addMember(clinicA, u.billingA, "billing");
  branchA =
    (await admin<{ id: string }[]>`select id from public.branches where clinic_id = ${clinicA}`)[0]
      ?.id ?? "";
  doctorA =
    (
      await admin<
        { id: string }[]
      >`insert into public.doctors (clinic_id, display_name) values (${clinicA}, 'Dr F') returning id`
    )[0]?.id ?? "";
  patientA =
    (
      await admin<
        { id: string }[]
      >`insert into public.patients (clinic_id, full_name) values (${clinicA}, 'Filler A') returning id`
    )[0]?.id ?? "";
  patientB =
    (
      await admin<
        { id: string }[]
      >`insert into public.patients (clinic_id, full_name) values (${clinicB}, 'Filler B') returning id`
    )[0]?.id ?? "";
  wlA =
    (
      await admin<
        { id: string }[]
      >`insert into public.waitlist_entries (clinic_id, patient_id, outreach_ok) values (${clinicA}, ${patientA}, true) returning id`
    )[0]?.id ?? "";
});
afterAll(async () => {
  await admin.end();
});

describe("slot offers", () => {
  it("owner and receptionist can propose; doctor and billing cannot", async () => {
    expect(await offer(u.recepA, 1)).toHaveLength(1);
    expect(await offer(u.ownerA, 2)).toHaveLength(1);
    for (const who of [u.doctorA, u.billingA]) {
      const err = await failure(
        who,
        (tx) =>
          tx`insert into public.slot_offers (clinic_id, branch_id, doctor_id, patient_id, starts_at, ends_at) values (${clinicA}, ${branchA}, ${doctorA}, ${patientA}, ${slot(3)}, ${slot(4)})`,
      );
      expect(err.code).toBe("42501");
    }
  });

  it("only the clinic's own staff can read offers, and the token hash is hidden", async () => {
    await asUser(u.recepA, async (tx) =>
      expect((await tx`select id from public.slot_offers`).length).toBeGreaterThan(0),
    );
    for (const who of [u.doctorA, u.billingA, u.ownerB]) {
      await asUser(who, async (tx) =>
        expect(
          await tx`select id from public.slot_offers where clinic_id = ${clinicA}`,
        ).toHaveLength(0),
      );
    }
    const star = await failure(u.ownerA, (tx) => tx`select * from public.slot_offers`);
    expect(star.code).toBe("42501");
    const col = await failure(u.ownerA, (tx) => tx`select token_hash from public.slot_offers`);
    expect(col.code).toBe("42501");
  });

  it("proposals start as 'proposed' and cannot be pre-accepted", async () => {
    const [o] = await offer(u.recepA, 5);
    const [row] = await admin<
      { status: string }[]
    >`select status from public.slot_offers where id = ${o?.id ?? ""}`;
    expect(row?.status).toBe("proposed");
    const spoof = await failure(
      u.recepA,
      (tx) =>
        tx`insert into public.slot_offers (clinic_id, branch_id, doctor_id, patient_id, starts_at, ends_at, status) values (${clinicA}, ${branchA}, ${doctorA}, ${patientA}, ${slot(6)}, ${slot(7)}, 'accepted')`,
    );
    expect(spoof.code).toBe("42501");
  });

  it("staff can approve (sent) or skip, but never accept, fill or edit the slot", async () => {
    const [o] = await offer(u.recepA, 8);
    await asUser(u.recepA, async (tx) => {
      const rows =
        await tx`update public.slot_offers set status = 'sent', token_hash = 'abc', sent_at = now(), expires_at = now() + interval '1 day' where id = ${o?.id ?? ""} returning id`;
      expect(rows).toHaveLength(1);
    });
    const accept = await failure(
      u.recepA,
      (tx) => tx`update public.slot_offers set status = 'accepted' where id = ${o?.id ?? ""}`,
    );
    expect(accept.code).toBe("42501");
    const fill = await failure(
      u.recepA,
      (tx) =>
        tx`update public.slot_offers set filled_appointment_id = gen_random_uuid() where id = ${o?.id ?? ""}`,
    );
    expect(fill.code).toBe("42501");
    const move = await failure(
      u.recepA,
      (tx) => tx`update public.slot_offers set starts_at = now() where id = ${o?.id ?? ""}`,
    );
    expect(move.code).toBe("42501");
  });

  it("another clinic cannot touch these offers", async () => {
    const [o] = await offer(u.ownerA, 9);
    await asUser(u.ownerB, async (tx) =>
      expect(
        await tx`update public.slot_offers set status = 'skipped' where id = ${o?.id ?? ""} returning id`,
      ).toHaveLength(0),
    );
  });

  it("rejects a duplicate offer for the same slot and patient", async () => {
    await offer(u.ownerA, 10);
    const err = await failure(
      u.ownerA,
      (tx) =>
        tx`insert into public.slot_offers (clinic_id, branch_id, doctor_id, patient_id, starts_at, ends_at) values (${clinicA}, ${branchA}, ${doctorA}, ${patientA}, ${slot(10)}, ${slot(11)})`,
    );
    expect(err.code).toBe("23505");
  });

  it("cannot point at another clinic's patient (composite foreign key)", async () => {
    const err = await failure(
      u.ownerA,
      (tx) =>
        tx`insert into public.slot_offers (clinic_id, branch_id, doctor_id, patient_id, starts_at, ends_at) values (${clinicA}, ${branchA}, ${doctorA}, ${patientB}, ${slot(12)}, ${slot(13)})`,
    );
    expect(err.code).toBe("23503");
  });

  it("anonymous users cannot read offers", async () => {
    const err = await failure(null, (tx) => tx`select id from public.slot_offers`);
    expect(err.code).toBe("42501");
  });
});

describe("visit value and chair_filler rule", () => {
  it("only the owner can set the typical visit value, within bounds", async () => {
    await asUser(u.ownerA, async (tx) =>
      expect(
        await tx`update public.clinics set avg_visit_value_centavos = 150000 where id = ${clinicA} returning id`,
      ).toHaveLength(1),
    );
    await asUser(u.recepA, async (tx) =>
      expect(
        await tx`update public.clinics set avg_visit_value_centavos = 1 where id = ${clinicA} returning id`,
      ).toHaveLength(0),
    );
    const neg = await failure(
      u.ownerA,
      (tx) => tx`update public.clinics set avg_visit_value_centavos = -5 where id = ${clinicA}`,
    );
    expect(neg.code).toBe("23514");
  });
  it("accepts the chair_filler rule kind", async () => {
    await asUserCommitted(
      u.ownerA,
      (tx) =>
        tx`insert into public.agent_rules (clinic_id, kind, autonomy, daily_limit) values (${clinicA}, 'chair_filler', 'approve', 10)`,
    );
    const bad = await failure(
      u.ownerA,
      (tx) => tx`insert into public.agent_rules (clinic_id, kind) values (${clinicA}, 'nonsense')`,
    );
    expect(bad.code).toBe("23514");
  });
});
