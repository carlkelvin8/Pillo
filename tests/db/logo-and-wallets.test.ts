import { beforeAll, describe, expect, it } from "vitest";
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
let invoiceId = "";
const u = { ownerA: "", doctorA: "", recepA: "", ownerB: "" };

beforeAll(async () => {
  u.ownerA = await createUser(uniqueEmail("lw-owner-a"));
  u.doctorA = await createUser(uniqueEmail("lw-doctor-a"));
  u.recepA = await createUser(uniqueEmail("lw-recep-a"));
  u.ownerB = await createUser(uniqueEmail("lw-owner-b"));
  clinicA = await createClinic(u.ownerA, "Logo Clinic A");
  clinicB = await createClinic(u.ownerB, "Logo Clinic B");
  await addMember(clinicA, u.doctorA, "doctor");
  await addMember(clinicA, u.recepA, "receptionist");
  const [p] = await admin<
    { id: string }[]
  >`insert into public.patients (clinic_id, full_name) values (${clinicA}, 'Wallet Patient') returning id`;
  invoiceId = await asUserCommitted(u.recepA, async (tx) => {
    const [inv] = await tx<{ id: string }[]>`
      insert into public.invoices (clinic_id, patient_id, due_on) values (${clinicA}, ${p?.id ?? ""}, current_date + 7) returning id`;
    const id = inv?.id ?? "";
    await tx`insert into public.invoice_items (clinic_id, invoice_id, position, description, quantity, unit_price_centavos)
             values (${clinicA}, ${id}, 0, 'Consultation', 1, 900000)`;
    await tx`update public.invoices set status = 'sent' where id = ${id}`;
    return id;
  });
});

describe("clinics.logo_path", () => {
  const good = () => `${clinicA}/logo-1700000000000.png`;

  it("lets an owner set and clear the logo path", async () => {
    const rows = await asUser(
      u.ownerA,
      (tx) =>
        tx`update public.clinics set logo_path = ${good()} where id = ${clinicA} returning logo_path`,
    );
    expect(rows).toHaveLength(1);
    const cleared = await asUser(
      u.ownerA,
      (tx) => tx`update public.clinics set logo_path = null where id = ${clinicA} returning id`,
    );
    expect(cleared).toHaveLength(1);
  });

  it.each([
    ["no folder", "logo.png"],
    ["path traversal", `${"a".repeat(36)}/../x.png`],
    ["nested folder", `${"a".repeat(36)}/x/y.png`],
    ["spaces", `${"a".repeat(36)}/my logo.png`],
    ["url", "https://evil.example/logo.png"],
    ["short folder", "abc/logo.png"],
  ])("rejects a malformed path: %s", async (_label, path) => {
    const err = await failure(
      u.ownerA,
      (tx) => tx`update public.clinics set logo_path = ${path} where id = ${clinicA}`,
    );
    expect(err.code).toBe("23514");
  });

  it("does not let non-owners change the logo", async () => {
    for (const who of [u.doctorA, u.recepA]) {
      const rows = await asUser(
        who,
        (tx) => tx`update public.clinics set logo_path = ${good()} where id = ${clinicA} returning id`,
      );
      expect(rows).toHaveLength(0);
    }
    const [row] = await admin<
      { logo_path: string | null }[]
    >`select logo_path from public.clinics where id = ${clinicA}`;
    expect(row?.logo_path).toBeNull();
  });

  it("does not let another clinic's owner change it", async () => {
    const rows = await asUser(
      u.ownerB,
      (tx) => tx`update public.clinics set logo_path = ${good()} where id = ${clinicA} returning id`,
    );
    expect(rows).toHaveLength(0);
    expect(clinicB).not.toBe(clinicA);
  });
});

describe("manual wallet payments (payments_insert)", () => {
  const record = (by: string, method: string, provider = "manual", status = "succeeded") =>
    failure(by, async (tx) => {
      await tx`insert into public.payments (clinic_id, invoice_id, method, amount_centavos, status, provider, paid_at)
               values (${clinicA}, ${invoiceId}, ${method}::public.payment_method, 1000, ${status}::public.payment_status, ${provider}, now())`;
    });

  it.each(["cash", "bank", "gcash", "maya"])("lets staff record a manual %s payment", async (m) => {
    const rows = await asUser(
      u.recepA,
      (tx) =>
        tx`insert into public.payments (clinic_id, invoice_id, method, amount_centavos, status, provider, paid_at)
           values (${clinicA}, ${invoiceId}, ${m}::public.payment_method, 1000, 'succeeded', 'manual', now()) returning id`,
    );
    expect(rows).toHaveLength(1);
  });

  it("still rejects a manual card payment", async () => {
    expect((await record(u.recepA, "card")).code).toBe("42501");
  });

  it("rejects client-made succeeded provider payments", async () => {
    expect((await record(u.recepA, "gcash", "paymongo")).code).toBe("42501");
    expect((await record(u.ownerA, "gcash", "mock")).code).toBe("42501");
  });

  it("keeps doctors and other clinics out", async () => {
    expect((await record(u.doctorA, "gcash")).code).toBe("42501");
    expect((await record(u.ownerB, "gcash")).code).toBe("42501");
  });
});
