import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  addMember,
  admin,
  asUser,
  createClinic,
  createUser,
  failure,
  uniqueEmail,
} from "./helpers";

let clinicA = "";
let clinicB = "";
let branchA = "";
let branchB = "";
let doctorRowA = ""; // doctors.id for the doctor user
let doctorRowA2 = ""; // second practitioner (no login)
let doctorRowB = "";
let patientA = "";
let patientB = "";
const u = { ownerA: "", doctorA: "", recepA: "", billingA: "", ownerB: "" };

const t = (hour: number, minute = 0) => new Date(Date.UTC(2027, 0, 12, hour, minute)).toISOString();

async function book(
  by: string,
  opts: {
    doctor?: string;
    patient?: string;
    start: string;
    end: string;
    status?: string;
    source?: string;
  },
) {
  return asUserCommitted(
    by,
    (tx) => tx`
    insert into public.appointments (clinic_id, branch_id, patient_id, doctor_id, starts_at, ends_at, status, source)
    values (${clinicA}, ${branchA}, ${opts.patient ?? patientA}, ${opts.doctor ?? doctorRowA},
            ${opts.start}, ${opts.end}, ${opts.status ?? "scheduled"}::public.appointment_status,
            ${opts.source ?? "staff"}::public.appointment_source)
    returning id`,
  );
}

import { asUserCommitted } from "./helpers";

beforeAll(async () => {
  u.ownerA = await createUser(uniqueEmail("s-owner-a"), { fullName: "Owner A" });
  u.doctorA = await createUser(uniqueEmail("s-doctor-a"), { fullName: "Doctor A" });
  u.recepA = await createUser(uniqueEmail("s-recep-a"));
  u.billingA = await createUser(uniqueEmail("s-billing-a"));
  u.ownerB = await createUser(uniqueEmail("s-owner-b"));

  clinicA = await createClinic(u.ownerA, "Sched Clinic A");
  clinicB = await createClinic(u.ownerB, "Sched Clinic B");
  await addMember(clinicA, u.doctorA, "doctor");
  await addMember(clinicA, u.recepA, "receptionist");
  await addMember(clinicA, u.billingA, "billing");

  const [bA] = await admin<
    { id: string }[]
  >`select id from public.branches where clinic_id = ${clinicA}`;
  const [bB] = await admin<
    { id: string }[]
  >`select id from public.branches where clinic_id = ${clinicB}`;
  branchA = bA?.id ?? "";
  branchB = bB?.id ?? "";

  const [d1] = await admin<{ id: string }[]>`
    select d.id from public.doctors d join public.memberships m on m.id = d.membership_id
    where d.clinic_id = ${clinicA} and m.user_id = ${u.doctorA}`;
  doctorRowA = d1?.id ?? "";
  const [d2] = await admin<{ id: string }[]>`
    insert into public.doctors (clinic_id, display_name) values (${clinicA}, 'Visiting Doctor') returning id`;
  doctorRowA2 = d2?.id ?? "";
  const [d3] = await admin<{ id: string }[]>`
    insert into public.doctors (clinic_id, display_name) values (${clinicB}, 'B Doctor') returning id`;
  doctorRowB = d3?.id ?? "";

  const [pA] = await admin<{ id: string }[]>`
    insert into public.patients (clinic_id, full_name) values (${clinicA}, 'Patient A') returning id`;
  const [pB] = await admin<{ id: string }[]>`
    insert into public.patients (clinic_id, full_name) values (${clinicB}, 'Patient B') returning id`;
  patientA = pA?.id ?? "";
  patientB = pB?.id ?? "";
});

afterAll(async () => {
  await admin.end();
});

describe("setup automation", () => {
  it("create_clinic makes a default branch", async () => {
    expect(branchA).not.toBe("");
    const [b] = await admin<
      { name: string }[]
    >`select name from public.branches where id = ${branchA}`;
    expect(b?.name).toBe("Main branch");
  });

  it("a doctor membership automatically becomes a bookable doctor", async () => {
    expect(doctorRowA).not.toBe("");
    const [d] = await admin<
      { display_name: string }[]
    >`select display_name from public.doctors where id = ${doctorRowA}`;
    expect(d?.display_name).toBe("Doctor A");
  });

  it("assigns sequential patient numbers per clinic and keeps them immutable", async () => {
    const [p2] = await admin<{ id: string; patient_number: number }[]>`
      insert into public.patients (clinic_id, full_name) values (${clinicA}, 'Second') returning id, patient_number`;
    const [first] = await admin<
      { patient_number: number }[]
    >`select patient_number from public.patients where id = ${patientA}`;
    expect(p2?.patient_number).toBe((first?.patient_number ?? 0) + 1);
    const [b1] = await admin<
      { patient_number: number }[]
    >`select patient_number from public.patients where id = ${patientB}`;
    expect(b1?.patient_number).toBe(1);
    await admin`update public.patients set patient_number = 999 where id = ${p2?.id ?? ""}`;
    const [after] = await admin<
      { patient_number: number }[]
    >`select patient_number from public.patients where id = ${p2?.id ?? ""}`;
    expect(after?.patient_number).toBe(p2?.patient_number);
  });
});

describe("tenant isolation", () => {
  it("clinic B cannot see clinic A rows in any scheduling table", async () => {
    for (const table of [
      "branches",
      "doctors",
      "patients",
      "appointments",
      "waitlist_entries",
      "clinic_hours",
    ]) {
      await asUser(u.ownerB, async (tx) => {
        const rows = await tx.unsafe(`select clinic_id from public.${table}`);
        expect(
          rows.every((r) => r.clinic_id === clinicB),
          table,
        ).toBe(true);
      });
    }
  });

  it("cannot insert a patient into another clinic", async () => {
    const err = await failure(
      u.ownerB,
      (tx) =>
        tx`insert into public.patients (clinic_id, full_name) values (${clinicA}, 'Intruder')`,
    );
    expect(err.code).toBe("42501");
  });

  it("composite foreign keys block cross-clinic references (even for admin)", async () => {
    const err = await failure(null, async () => {
      await admin`
        insert into public.appointments (clinic_id, branch_id, patient_id, doctor_id, starts_at, ends_at)
        values (${clinicA}, ${branchA}, ${patientB}, ${doctorRowA}, ${t(1)}, ${t(2)})`;
    }).catch((e: unknown) => e as { code?: string });
    expect((err as { code?: string }).code).toBe("23503");
  });
});

describe("role matrix", () => {
  it("billing can read patients and appointments but not write them", async () => {
    await asUser(u.billingA, async (tx) => {
      expect((await tx`select 1 from public.patients`).length).toBeGreaterThan(0);
    });
    const insPatient = await failure(
      u.billingA,
      (tx) => tx`insert into public.patients (clinic_id, full_name) values (${clinicA}, 'x')`,
    );
    expect(insPatient.code).toBe("42501");
    const insAppt = await failure(
      u.billingA,
      (
        tx,
      ) => tx`insert into public.appointments (clinic_id, branch_id, patient_id, doctor_id, starts_at, ends_at)
                 values (${clinicA}, ${branchA}, ${patientA}, ${doctorRowA}, ${t(3)}, ${t(4)})`,
    );
    expect(insAppt.code).toBe("42501");
  });

  it("receptionist can register patients and book, but cannot touch clinical data", async () => {
    const created = await book(u.recepA, { start: t(5), end: t(6) });
    expect(created).toHaveLength(1);
    await asUser(u.recepA, async (tx) => {
      expect(await tx`select 1 from public.visits`).toHaveLength(0);
      expect(await tx`select 1 from public.prescriptions`).toHaveLength(0);
    });
    const visit = await failure(
      u.recepA,
      (tx) =>
        tx`insert into public.visits (clinic_id, patient_id, notes) values (${clinicA}, ${patientA}, 'x')`,
    );
    expect(visit.code).toBe("42501");
  });

  it("doctor can read and write clinical data; billing cannot read it", async () => {
    await asUserCommitted(u.doctorA, async (tx) => {
      await tx`insert into public.visits (clinic_id, patient_id, doctor_id, title, vitals)
               values (${clinicA}, ${patientA}, ${doctorRowA}, 'Check-up', '{"heart_rate":72}'::jsonb)`;
      await tx`insert into public.prescriptions (clinic_id, patient_id, medication, dosage)
               values (${clinicA}, ${patientA}, 'Losartan', '50 mg daily')`;
    });
    await asUser(u.doctorA, async (tx) => {
      expect(await tx`select 1 from public.visits`).toHaveLength(1);
      expect(await tx`select 1 from public.prescriptions`).toHaveLength(1);
    });
    await asUser(u.billingA, async (tx) => {
      expect(await tx`select 1 from public.visits`).toHaveLength(0);
    });
    await asUser(u.ownerB, async (tx) => {
      expect(await tx`select 1 from public.visits`).toHaveLength(0);
    });
  });

  it("visits cannot reference another clinic's patient", async () => {
    const err = await failure(
      u.doctorA,
      (tx) =>
        tx`insert into public.visits (clinic_id, patient_id) values (${clinicA}, ${patientB})`,
    );
    expect(err.code).toBe("23503");
  });

  it("only owners change branches, hours and doctors", async () => {
    for (const who of [u.doctorA, u.recepA, u.billingA]) {
      const err = await failure(
        who,
        (tx) => tx`insert into public.branches (clinic_id, name) values (${clinicA}, 'Sneaky')`,
      );
      expect(err.code).toBe("42501");
    }
    await asUser(u.ownerA, async (tx) => {
      const rows =
        await tx`insert into public.branches (clinic_id, name) values (${clinicA}, 'Second branch') returning id`;
      expect(rows).toHaveLength(1);
    });
  });

  it("a doctor row cannot link a membership from another clinic", async () => {
    const [m] = await admin<
      { id: string }[]
    >`select id from public.memberships where clinic_id = ${clinicB} limit 1`;
    const err = await failure(
      u.ownerA,
      (tx) => tx`insert into public.doctors (clinic_id, membership_id, display_name)
                 values (${clinicA}, ${m?.id ?? ""}, 'Hijack')`,
    );
    expect(err.code).toBe("42501");
  });

  it("waitlist is front-desk only and outreach defaults to NOT allowed", async () => {
    await asUserCommitted(u.recepA, async (tx) => {
      await tx`insert into public.waitlist_entries (clinic_id, patient_id, reason) values (${clinicA}, ${patientA}, 'cleaning')`;
    });
    await asUser(u.billingA, async (tx) => {
      expect(await tx`select 1 from public.waitlist_entries`).toHaveLength(0);
    });
    const [w] = await admin<{ outreach_ok: boolean; status: string }[]>`
      select outreach_ok, status from public.waitlist_entries where clinic_id = ${clinicA} limit 1`;
    expect(w?.outreach_ok).toBe(false);
    expect(w?.status).toBe("waiting");
  });
});

describe("waitlist uniqueness", () => {
  it("allows only one active entry per patient, but a removed one does not block", async () => {
    const [p] = await admin<{ id: string }[]>`
      insert into public.patients (clinic_id, full_name) values (${clinicA}, 'Waitlist Twice') returning id`;
    const pid = p?.id ?? "";
    await asUserCommitted(u.recepA, async (tx) => {
      await tx`insert into public.waitlist_entries (clinic_id, patient_id) values (${clinicA}, ${pid})`;
    });
    const err = await failure(
      u.recepA,
      (tx) => tx`insert into public.waitlist_entries (clinic_id, patient_id) values (${clinicA}, ${pid})`,
    );
    expect(err.code).toBe("23505");

    await admin`update public.waitlist_entries set status = 'removed' where clinic_id = ${clinicA} and patient_id = ${pid}`;
    await asUser(u.recepA, async (tx) => {
      const rows =
        await tx`insert into public.waitlist_entries (clinic_id, patient_id) values (${clinicA}, ${pid}) returning id`;
      expect(rows).toHaveLength(1);
    });
  });
});

describe("save_branch_hours", () => {
  type Hour = { weekday: number; opens_at: string; closes_at: string };
  const hoursOf = async (branch: string) =>
    admin<Hour[]>`
      select weekday, to_char(opens_at, 'HH24:MI') as opens_at, to_char(closes_at, 'HH24:MI') as closes_at
      from public.clinic_hours where clinic_id = ${clinicA} and branch_id = ${branch} order by weekday`;
  let branch = "";

  beforeAll(async () => {
    const [b] = await admin<{ id: string }[]>`
      insert into public.branches (clinic_id, name) values (${clinicA}, 'Hours branch') returning id`;
    branch = b?.id ?? "";
    await admin`insert into public.clinic_hours (clinic_id, branch_id, weekday, opens_at, closes_at)
                values (${clinicA}, ${branch}, 1, '09:00', '17:00'), (${clinicA}, ${branch}, 2, '09:00', '17:00')`;
  });

  it("saving a week with every day closed is remembered as saved", async () => {
    const [b] = await admin<{ id: string }[]>`
      insert into public.branches (clinic_id, name) values (${clinicA}, 'Closed branch') returning id`;
    await asUserCommitted(u.ownerA, async (tx) => {
      await tx`select public.save_branch_hours(${clinicA}, ${b!.id}, ${tx.json([])})`;
    });
    const [row] = await admin<{ saved: boolean; hours: number }[]>`
      select hours_saved_at is not null as saved,
             (select count(*)::int from public.clinic_hours where branch_id = ${b!.id}) as hours
      from public.branches where id = ${b!.id}`;
    expect(row).toEqual({ saved: true, hours: 0 });
  });

  it("an owner replaces the week in one call", async () => {
    const week = [
      { weekday: 3, opens_at: "08:00", closes_at: "12:00" },
      { weekday: 4, opens_at: "13:00", closes_at: "18:00" },
    ];
    await asUserCommitted(u.ownerA, async (tx) => {
      await tx`select public.save_branch_hours(${clinicA}, ${branch}, ${tx.json(week)})`;
    });
    expect(await hoursOf(branch)).toEqual(week);
  });

  it("receptionists and doctors cannot save hours, and the week stays unchanged", async () => {
    const before = await hoursOf(branch);
    for (const who of [u.recepA, u.doctorA]) {
      const err = await failure(
        who,
        (tx) =>
          tx`select public.save_branch_hours(${clinicA}, ${branch}, ${tx.json([{ weekday: 5, opens_at: "09:00", closes_at: "10:00" }])})`,
      );
      expect(err.code).toBe("42501");
    }
    expect(await hoursOf(branch)).toEqual(before);
  });

  it("an invalid row (closes before opens) fails and keeps the previous hours", async () => {
    const before = await hoursOf(branch);
    expect(before.length).toBeGreaterThan(0);
    const err = await failure(
      u.ownerA,
      (tx) =>
        tx`select public.save_branch_hours(${clinicA}, ${branch}, ${tx.json([
          { weekday: 1, opens_at: "09:00", closes_at: "10:00" },
          { weekday: 2, opens_at: "17:00", closes_at: "09:00" },
        ])})`,
    );
    expect(err.code).toBe("23514");
    expect(await hoursOf(branch)).toEqual(before);
  });
});

describe("appointments", () => {
  it("clients cannot create AI/portal appointments or pre-completed ones", async () => {
    const ai = await failure(
      u.recepA,
      (
        tx,
      ) => tx`insert into public.appointments (clinic_id, branch_id, patient_id, doctor_id, starts_at, ends_at, source)
                 values (${clinicA}, ${branchA}, ${patientA}, ${doctorRowA}, ${t(7)}, ${t(8)}, 'ai')`,
    );
    expect(ai.code).toBe("42501");
    const done = await failure(
      u.recepA,
      (
        tx,
      ) => tx`insert into public.appointments (clinic_id, branch_id, patient_id, doctor_id, starts_at, ends_at, status)
                 values (${clinicA}, ${branchA}, ${patientA}, ${doctorRowA}, ${t(7)}, ${t(8)}, 'completed')`,
    );
    expect(done.code).toBe("42501");
  });

  it("records the booking user and does not let clients spoof created_by", async () => {
    const spoof = await failure(
      u.recepA,
      (
        tx,
      ) => tx`insert into public.appointments (clinic_id, branch_id, patient_id, doctor_id, starts_at, ends_at, created_by)
                 values (${clinicA}, ${branchA}, ${patientA}, ${doctorRowA}, ${t(9)}, ${t(10)}, ${u.ownerA})`,
    );
    expect(spoof.code).toBe("42501");
    const [row] = await book(u.recepA, { start: t(9), end: t(10) });
    const [stored] = await admin<
      { created_by: string }[]
    >`select created_by from public.appointments where id = ${row?.id ?? ""}`;
    expect(stored?.created_by).toBe(u.recepA);
  });

  it("never double-books a doctor, but allows back-to-back and other doctors", async () => {
    await book(u.ownerA, { start: t(11), end: t(12) });
    const overlap = await failure(
      u.ownerA,
      (
        tx,
      ) => tx`insert into public.appointments (clinic_id, branch_id, patient_id, doctor_id, starts_at, ends_at)
                 values (${clinicA}, ${branchA}, ${patientA}, ${doctorRowA}, ${t(11, 30)}, ${t(12, 30)})`,
    );
    expect(overlap.code).toBe("23P01");
    expect(await book(u.ownerA, { start: t(12), end: t(13) })).toHaveLength(1); // adjacent
    expect(await book(u.ownerA, { doctor: doctorRowA2, start: t(11), end: t(12) })).toHaveLength(1); // other doctor
  });

  it("cancelling frees the slot and stamps cancelled_at; reinstating re-checks overlap", async () => {
    const [first] = await book(u.ownerA, { start: t(14), end: t(15) });
    await asUserCommitted(u.recepA, async (tx) => {
      await tx`update public.appointments set status = 'cancelled', cancel_reason = 'patient request' where id = ${first?.id ?? ""}`;
    });
    const [c] = await admin<
      { cancelled_at: string | null }[]
    >`select cancelled_at from public.appointments where id = ${first?.id ?? ""}`;
    expect(c?.cancelled_at).not.toBeNull();

    const [second] = await book(u.ownerA, { start: t(14), end: t(15) }); // slot is free again
    expect(second?.id).toBeTruthy();
    const reinstate = await failure(
      u.ownerA,
      (tx) => tx`update public.appointments set status = 'scheduled' where id = ${first?.id ?? ""}`,
    );
    expect(reinstate.code).toBe("23P01");
  });

  it("can move an appointment, but not into an occupied slot, and cannot change the patient", async () => {
    const [a] = await book(u.ownerA, { doctor: doctorRowA2, start: t(16), end: t(17) });
    await asUser(u.recepA, async (tx) => {
      const rows =
        await tx`update public.appointments set starts_at = ${t(17)}, ends_at = ${t(18)} where id = ${a?.id ?? ""} returning id`;
      expect(rows).toHaveLength(1);
    });
    const swap = await failure(
      u.recepA,
      (tx) => tx`update public.appointments set patient_id = ${patientB} where id = ${a?.id ?? ""}`,
    );
    expect(swap.code).toBe("42501");
    const range = await failure(
      u.recepA,
      (tx) => tx`update public.appointments set ends_at = starts_at where id = ${a?.id ?? ""}`,
    );
    expect(range.code).toBe("23514");
  });

  it("billing and other clinics cannot modify appointments (0 rows)", async () => {
    const [a] = await book(u.ownerA, { doctor: doctorRowA2, start: t(19), end: t(20) });
    for (const who of [u.billingA, u.ownerB]) {
      await asUser(who, async (tx) => {
        const rows =
          await tx`update public.appointments set reason = 'x' where id = ${a?.id ?? ""} returning id`;
        expect(rows).toHaveLength(0);
      });
    }
  });
});

describe("patients", () => {
  it("rejects future birthdates and blank names", async () => {
    const future = await failure(
      u.recepA,
      (tx) =>
        tx`insert into public.patients (clinic_id, full_name, birthdate) values (${clinicA}, 'X', '2999-01-01')`,
    );
    expect(future.code).toBe("23514");
    const blank = await failure(
      u.recepA,
      (tx) => tx`insert into public.patients (clinic_id, full_name) values (${clinicA}, '   ')`,
    );
    expect(blank.code).toBe("23514");
  });

  it("only owners can delete patients", async () => {
    const [p] = await admin<
      { id: string }[]
    >`insert into public.patients (clinic_id, full_name) values (${clinicA}, 'Disposable') returning id`;
    await asUser(u.recepA, async (tx) => {
      expect(
        await tx`delete from public.patients where id = ${p?.id ?? ""} returning id`,
      ).toHaveLength(0);
    });
    await asUser(u.ownerA, async (tx) => {
      expect(
        await tx`delete from public.patients where id = ${p?.id ?? ""} returning id`,
      ).toHaveLength(1);
    });
  });

  it("anonymous users cannot read anything", async () => {
    for (const table of ["patients", "appointments", "branches", "doctors", "visits"]) {
      const err = await failure(null, (tx) => tx.unsafe(`select * from public.${table}`));
      expect(err.code, table).toBe("42501");
    }
  });
});

void branchB;
void doctorRowB;
