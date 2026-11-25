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
let patientA = "";
const u = { ownerA: "", doctorA: "", recepA: "", billingA: "", ownerB: "" };

type Item = { description: string; qty: number; price: number };

/** Create a draft invoice with items as `by`, optionally sending it. Returns the invoice id. */
async function makeInvoice(
  by: string,
  opts: { items?: Item[]; send?: boolean; discount?: number; tax?: number } = {},
): Promise<string> {
  const items = opts.items ?? [{ description: "Consultation", qty: 1, price: 150000 }];
  return asUserCommitted(by, async (tx) => {
    const [inv] = await tx<{ id: string }[]>`
      insert into public.invoices (clinic_id, patient_id, due_on, discount_centavos, tax_centavos)
      values (${clinicA}, ${patientA}, current_date + 7, ${opts.discount ?? 0}, ${opts.tax ?? 0}) returning id`;
    const id = inv?.id ?? "";
    for (const [i, it] of items.entries()) {
      await tx`insert into public.invoice_items (clinic_id, invoice_id, position, description, quantity, unit_price_centavos)
               values (${clinicA}, ${id}, ${i}, ${it.description}, ${it.qty}, ${it.price})`;
    }
    if (opts.send) await tx`update public.invoices set status = 'sent' where id = ${id}`;
    return id;
  });
}

const totals = async (id: string) =>
  (
    await admin<
      {
        subtotal_centavos: string;
        total_centavos: string;
        status: string;
        invoice_number: number;
      }[]
    >`
    select subtotal_centavos, total_centavos, status, invoice_number from public.invoices where id = ${id}`
  )[0];

async function asService<T>(fn: (tx: typeof admin) => Promise<T>): Promise<T> {
  return admin.begin(async (tx) => {
    await tx.unsafe("set local role service_role");
    return fn(tx as unknown as typeof admin);
  }) as Promise<T>;
}

const applyEvent = (eventId: string, ref: string, amount: number) =>
  asService(
    (tx) =>
      tx`select public.apply_provider_payment('paymongo', ${eventId}, 'link.payment.paid', ${ref}, 'gcash', ${amount}, 'GC-1', now()) as r`,
  );

beforeAll(async () => {
  u.ownerA = await createUser(uniqueEmail("b-owner-a"));
  u.doctorA = await createUser(uniqueEmail("b-doctor-a"));
  u.recepA = await createUser(uniqueEmail("b-recep-a"));
  u.billingA = await createUser(uniqueEmail("b-billing-a"));
  u.ownerB = await createUser(uniqueEmail("b-owner-b"));
  clinicA = await createClinic(u.ownerA, "Billing Clinic A");
  clinicB = await createClinic(u.ownerB, "Billing Clinic B");
  await addMember(clinicA, u.doctorA, "doctor");
  await addMember(clinicA, u.recepA, "receptionist");
  await addMember(clinicA, u.billingA, "billing");
  const [p] = await admin<
    { id: string }[]
  >`insert into public.patients (clinic_id, full_name) values (${clinicA}, 'Bill Patient') returning id`;
  patientA = p?.id ?? "";
});

afterAll(async () => {
  await admin.end();
});

describe("invoice totals", () => {
  it("derives subtotal and total from the items", async () => {
    const id = await makeInvoice(u.recepA, {
      items: [
        { description: "Consultation", qty: 1, price: 150000 },
        { description: "Vaccination", qty: 2, price: 85000 },
      ],
    });
    const t = await totals(id);
    expect(t?.subtotal_centavos).toBe("320000");
    expect(t?.total_centavos).toBe("320000");
  });

  it("applies discount and tax, and never goes below the tax floor", async () => {
    const id = await makeInvoice(u.billingA, { discount: 20000, tax: 5000 });
    expect((await totals(id))?.total_centavos).toBe("135000"); // 150000 - 20000 + 5000
    const big = await makeInvoice(u.billingA, { discount: 999999999, tax: 0 });
    expect((await totals(big))?.total_centavos).toBe("0");
  });

  it("recalculates when items change or are removed", async () => {
    const id = await makeInvoice(u.recepA, {
      items: [
        { description: "A", qty: 1, price: 1000 },
        { description: "B", qty: 1, price: 2000 },
      ],
    });
    await asUserCommitted(u.recepA, async (tx) => {
      await tx`update public.invoice_items set quantity = 3 where invoice_id = ${id} and description = 'A'`;
      await tx`delete from public.invoice_items where invoice_id = ${id} and description = 'B'`;
    });
    expect((await totals(id))?.total_centavos).toBe("3000");
  });

  it("clients cannot write totals, numbers or paid status directly", async () => {
    const id = await makeInvoice(u.recepA);
    for (const sql of [
      `update public.invoices set total_centavos = 1 where id = '${id}'`,
      `update public.invoices set subtotal_centavos = 1 where id = '${id}'`,
      `update public.invoices set invoice_number = 999 where id = '${id}'`,
    ]) {
      const err = await failure(u.recepA, (tx) => tx.unsafe(sql));
      expect(err.code, sql).toBe("42501");
    }
    const paid = await failure(
      u.recepA,
      (tx) => tx`update public.invoices set status = 'paid' where id = ${id}`,
    );
    expect(paid.code).toBe("P0001");
  });

  it("numbers invoices sequentially per clinic", async () => {
    const a = await makeInvoice(u.recepA);
    const b = await makeInvoice(u.recepA);
    expect((await totals(b))?.invoice_number).toBe((await totals(a))!.invoice_number + 1);
  });

  it("rejects bad item values", async () => {
    const id = await makeInvoice(u.recepA);
    const neg = await failure(
      u.recepA,
      (tx) =>
        tx`insert into public.invoice_items (clinic_id, invoice_id, description, quantity, unit_price_centavos) values (${clinicA}, ${id}, 'x', 1, -5)`,
    );
    expect(neg.code).toBe("23514");
    const zero = await failure(
      u.recepA,
      (tx) =>
        tx`insert into public.invoice_items (clinic_id, invoice_id, description, quantity, unit_price_centavos) values (${clinicA}, ${id}, 'x', 0, 5)`,
    );
    expect(zero.code).toBe("23514");
  });
});

describe("create_invoice (atomic)", () => {
  const call = (by: string, items: unknown) =>
    asUserCommitted(
      by,
      (tx) => tx<{ id: string }[]>`
      select public.create_invoice(${clinicA}, ${patientA}, null, null, current_date, current_date + 7, 'note', 0, 0, ${tx.json(items as never)}) as id`,
    );

  it("creates the invoice and its items in one go", async () => {
    const [r] = await call(u.recepA, [
      { description: "Consultation", quantity: 1, unit_price_centavos: 150000 },
      { description: "Vaccination", quantity: 2, unit_price_centavos: 85000 },
    ]);
    const t = await totals(r?.id ?? "");
    expect(t?.total_centavos).toBe("320000");
    expect(t?.status).toBe("draft");
  });

  it("rolls everything back when an item is invalid (no orphan invoice)", async () => {
    const before = (await admin`select 1 from public.invoices where clinic_id = ${clinicA}`).length;
    const err = await failure(
      u.recepA,
      (tx) =>
        tx`select public.create_invoice(${clinicA}, ${patientA}, null, null, current_date, current_date + 7, null, 0, 0, ${tx.json(
          [
            { description: "ok", quantity: 1, unit_price_centavos: 100 },
            { description: "bad", quantity: 0, unit_price_centavos: 100 },
          ] as never,
        )})`,
    );
    expect(err.code).toBe("23514");
    expect((await admin`select 1 from public.invoices where clinic_id = ${clinicA}`).length).toBe(
      before,
    );
  });

  it("requires items and respects roles", async () => {
    const empty = await failure(
      u.recepA,
      (tx) =>
        tx`select public.create_invoice(${clinicA}, ${patientA}, null, null, current_date, current_date + 7, null, 0, 0, '[]'::jsonb)`,
    );
    expect(empty.code).toBe("22023");
    const doc = await failure(
      u.doctorA,
      (tx) =>
        tx`select public.create_invoice(${clinicA}, ${patientA}, null, null, current_date, current_date + 7, null, 0, 0, ${tx.json([{ description: "x", quantity: 1, unit_price_centavos: 1 }] as never)})`,
    );
    expect(doc.code).toBe("42501");
    const cross = await failure(
      u.ownerB,
      (tx) =>
        tx`select public.create_invoice(${clinicA}, ${patientA}, null, null, current_date, current_date + 7, null, 0, 0, ${tx.json([{ description: "x", quantity: 1, unit_price_centavos: 1 }] as never)})`,
    );
    expect(cross.code).toBe("42501");
  });
});

describe("invoice lifecycle and access", () => {
  it("is frozen once sent", async () => {
    const id = await makeInvoice(u.recepA, { send: true });
    const [t] = await admin<
      { sent_at: string | null }[]
    >`select sent_at from public.invoices where id = ${id}`;
    expect(t?.sent_at).not.toBeNull();
    const item = await failure(
      u.recepA,
      (tx) =>
        tx`insert into public.invoice_items (clinic_id, invoice_id, description, quantity, unit_price_centavos) values (${clinicA}, ${id}, 'late', 1, 100)`,
    );
    expect(item.message).toMatch(/draft/);
    const discount = await failure(
      u.recepA,
      (tx) => tx`update public.invoices set discount_centavos = 1 where id = ${id}`,
    );
    expect(discount.message).toMatch(/draft/);
    const back = await failure(
      u.recepA,
      (tx) => tx`update public.invoices set status = 'draft' where id = ${id}`,
    );
    expect(back.code).toBe("P0001");
  });

  it("freezes every editable header after sending while keeping drafts editable", async () => {
    const draft = await makeInvoice(u.recepA);
    await asUserCommitted(u.recepA, async (tx) => {
      await tx`update public.invoices set due_on = current_date + 14 where id = ${draft}`;
      await tx`update public.invoice_items set description = 'Updated consultation' where invoice_id = ${draft}`;
    });

    const sent = await makeInvoice(u.recepA, { send: true });
    const otherPatients = await admin<{ id: string }[]>`
      insert into public.patients (clinic_id, full_name) values (${clinicA}, 'Other Bill Patient') returning id`;
    const otherPatient = otherPatients[0]?.id;
    if (!otherPatient) throw new Error("Could not create the second billing test patient.");
    const dueDate = await failure(
      u.recepA,
      (tx) => tx`update public.invoices set due_on = current_date + 14 where id = ${sent}`,
    );
    expect(dueDate.message).toMatch(/draft/);
    const patient = await failure(
      u.recepA,
      (tx) => tx`update public.invoices set patient_id = ${otherPatient} where id = ${sent}`,
    );
    expect(patient.message).toMatch(/draft/);
  });

  it("freezes invoice headers after payment", async () => {
    const paid = await makeInvoice(u.recepA, { send: true });
    await asUserCommitted(u.recepA, async (tx) => {
      await tx`select set_config('app.allow_paid', '1', true)`;
      await tx`update public.invoices set status = 'paid' where id = ${paid}`;
    });

    const dueDate = await failure(
      u.recepA,
      (tx) => tx`update public.invoices set due_on = current_date + 14 where id = ${paid}`,
    );
    expect(dueDate.message).toMatch(/draft/);
  });

  it("doctors and other clinics cannot see invoices", async () => {
    await makeInvoice(u.recepA);
    for (const who of [u.doctorA, u.ownerB]) {
      await asUser(who, async (tx) => {
        expect(await tx`select 1 from public.invoices where clinic_id = ${clinicA}`).toHaveLength(
          0,
        );
      });
    }
    const err = await failure(
      u.doctorA,
      (tx) =>
        tx`insert into public.invoices (clinic_id, patient_id, due_on) values (${clinicA}, ${patientA}, current_date + 1)`,
    );
    expect(err.code).toBe("42501");
  });

  it("cannot invoice another clinic's patient", async () => {
    const [pb] = await admin<
      { id: string }[]
    >`insert into public.patients (clinic_id, full_name) values (${clinicB}, 'B patient') returning id`;
    const err = await failure(
      u.recepA,
      (tx) =>
        tx`insert into public.invoices (clinic_id, patient_id, due_on) values (${clinicA}, ${pb?.id ?? ""}, current_date + 1)`,
    );
    expect(err.code).toBe("23503");
  });

  it("can void a sent invoice with no payments but not one with payments", async () => {
    const a = await makeInvoice(u.billingA, { send: true });
    await asUser(u.billingA, async (tx) => {
      expect(
        await tx`update public.invoices set status = 'void' where id = ${a} returning id`,
      ).toHaveLength(1);
    });
    const b = await makeInvoice(u.billingA, { send: true });
    await asUserCommitted(
      u.billingA,
      (tx) =>
        tx`insert into public.payments (clinic_id, invoice_id, method, amount_centavos, status, provider, paid_at) values (${clinicA}, ${b}, 'cash', 10000, 'succeeded', 'manual', now())`,
    );
    const err = await failure(
      u.billingA,
      (tx) => tx`update public.invoices set status = 'void' where id = ${b}`,
    );
    expect(err.message).toMatch(/cannot be voided/);
  });
});

describe("payments", () => {
  const cash = (by: string, invoice: string, amount: number) =>
    asUserCommitted(
      by,
      (
        tx,
      ) => tx`insert into public.payments (clinic_id, invoice_id, method, amount_centavos, status, provider, paid_at)
      values (${clinicA}, ${invoice}, 'cash', ${amount}, 'succeeded', 'manual', now()) returning id`,
    );

  it("a cash payment in full marks the invoice paid; a partial one does not", async () => {
    const id = await makeInvoice(u.recepA, {
      send: true,
      items: [{ description: "X", qty: 1, price: 100000 }],
    });
    await cash(u.recepA, id, 40000);
    expect((await totals(id))?.status).toBe("sent");
    await cash(u.recepA, id, 60000);
    expect((await totals(id))?.status).toBe("paid");
  });

  it("rejects overpayment and payments on drafts", async () => {
    const id = await makeInvoice(u.recepA, {
      send: true,
      items: [{ description: "X", qty: 1, price: 100000 }],
    });
    const over = await failure(
      u.recepA,
      (tx) =>
        tx`insert into public.payments (clinic_id, invoice_id, method, amount_centavos, status, provider, paid_at) values (${clinicA}, ${id}, 'cash', 100001, 'succeeded', 'manual', now())`,
    );
    expect(over.message).toMatch(/more than the amount due/);
    const draft = await makeInvoice(u.recepA);
    const err = await failure(
      u.recepA,
      (tx) =>
        tx`insert into public.payments (clinic_id, invoice_id, method, amount_centavos, status, provider, paid_at) values (${clinicA}, ${draft}, 'cash', 100, 'succeeded', 'manual', now())`,
    );
    expect(err.message).toMatch(/sent invoice/);
  });

  it("clients cannot fabricate provider payments or edit succeeded ones", async () => {
    const id = await makeInvoice(u.recepA, { send: true });
    const fake = await failure(
      u.recepA,
      (tx) =>
        tx`insert into public.payments (clinic_id, invoice_id, method, amount_centavos, status, provider, provider_ref, paid_at) values (${clinicA}, ${id}, 'gcash', 100, 'succeeded', 'paymongo', 'link_fake', now())`,
    );
    expect(fake.code).toBe("42501");
    const [paid] = await cash(u.recepA, id, 100);
    const edit = await failure(
      u.recepA,
      (tx) => tx`update public.payments set status = 'cancelled' where id = ${paid?.id ?? ""}`,
    );
    expect(edit.code).toBe("P0001");
  });

  it("clients can open a pending link and cancel it", async () => {
    const id = await makeInvoice(u.recepA, { send: true });
    const [link] = await asUserCommitted(
      u.recepA,
      (tx) =>
        tx`insert into public.payments (clinic_id, invoice_id, amount_centavos, status, provider, provider_ref, checkout_url) values (${clinicA}, ${id}, 150000, 'pending', 'paymongo', ${"link_" + Math.random().toString(36).slice(2)}, 'https://pm.test/x') returning id`,
    );
    await asUser(u.recepA, async (tx) => {
      expect(
        await tx`update public.payments set status = 'cancelled' where id = ${link?.id ?? ""} returning id`,
      ).toHaveLength(1);
    });
  });

  it("doctors cannot read payments", async () => {
    await asUser(u.doctorA, async (tx) => {
      expect(await tx`select 1 from public.payments`).toHaveLength(0);
    });
  });
});

describe("provider webhook (apply_provider_payment)", () => {
  async function pendingLink(amount = 150000) {
    const id = await makeInvoice(u.recepA, {
      send: true,
      items: [{ description: "X", qty: 1, price: amount }],
    });
    const ref = "link_" + Math.random().toString(36).slice(2, 12);
    await asUserCommitted(
      u.recepA,
      (tx) =>
        tx`insert into public.payments (clinic_id, invoice_id, amount_centavos, status, provider, provider_ref, checkout_url) values (${clinicA}, ${id}, ${amount}, 'pending', 'paymongo', ${ref}, 'https://pm.test/x')`,
    );
    return { id, ref };
  }
  const eid = () => "evt_" + Math.random().toString(36).slice(2, 12);

  it("applies a matching payment and marks the invoice paid", async () => {
    const { id, ref } = await pendingLink();
    const [r] = await applyEvent(eid(), ref, 150000);
    expect((r as unknown as { r: string }).r).toBe("applied");
    expect((await totals(id))?.status).toBe("paid");
    const [p] = await admin<
      { status: string; method: string; reference: string }[]
    >`select status, method, reference from public.payments where provider_ref = ${ref}`;
    expect(p).toMatchObject({ status: "succeeded", method: "gcash", reference: "GC-1" });
    const log =
      await admin`select 1 from public.audit_log where clinic_id = ${clinicA} and action = 'payment.succeeded' and actor_type = 'system'`;
    expect(log.length).toBeGreaterThan(0);
  });

  it("is idempotent: replaying the same event changes nothing", async () => {
    const { ref } = await pendingLink();
    const e = eid();
    expect(((await applyEvent(e, ref, 150000))[0] as unknown as { r: string }).r).toBe("applied");
    expect(((await applyEvent(e, ref, 150000))[0] as unknown as { r: string }).r).toBe("duplicate");
    const n = await admin`select 1 from public.provider_events where event_id = ${e}`;
    expect(n).toHaveLength(1);
  });

  it("a second event for an already-paid link is not double counted", async () => {
    const { id, ref } = await pendingLink();
    await applyEvent(eid(), ref, 150000);
    expect(((await applyEvent(eid(), ref, 150000))[0] as unknown as { r: string }).r).toBe(
      "already_paid",
    );
    const [sum] = await admin<
      { s: string }[]
    >`select sum(amount_centavos)::text as s from public.payments where invoice_id = ${id} and status = 'succeeded'`;
    expect(sum?.s).toBe("150000");
  });

  it("refuses an amount mismatch and leaves the payment pending", async () => {
    const { id, ref } = await pendingLink();
    expect(((await applyEvent(eid(), ref, 100))[0] as unknown as { r: string }).r).toBe(
      "amount_mismatch",
    );
    expect((await totals(id))?.status).toBe("sent");
    const [p] = await admin<
      { status: string }[]
    >`select status from public.payments where provider_ref = ${ref}`;
    expect(p?.status).toBe("pending");
  });

  it("ignores unknown references", async () => {
    expect(((await applyEvent(eid(), "link_nope", 100))[0] as unknown as { r: string }).r).toBe(
      "unknown_reference",
    );
  });

  it("is callable only by the service role", async () => {
    const authed = await failure(
      u.ownerA,
      (tx) =>
        tx`select public.apply_provider_payment('paymongo', 'e', 't', 'r', 'gcash', 1, 'x', now())`,
    );
    expect(authed.code).toBe("42501");
    const anon = await failure(
      null,
      (tx) =>
        tx`select public.apply_provider_payment('paymongo', 'e', 't', 'r', 'gcash', 1, 'x', now())`,
    );
    expect(anon.code).toBe("42501");
    for (const table of ["provider_events"]) {
      const err = await failure(u.ownerA, (tx) => tx.unsafe(`select * from public.${table}`));
      expect(err.code).toBe("42501");
    }
  });
});

describe("balance and mock payouts", () => {
  const balance = async (who: string) =>
    asUser(
      who,
      async (tx) =>
        (await tx<{ b: string }[]>`select public.clinic_balance(${clinicA}) as b`)[0]?.b,
    );

  it("counts only online payments, not manual cash", async () => {
    const before = BigInt((await balance(u.ownerA)) ?? "0");
    const id = await makeInvoice(u.recepA, {
      send: true,
      items: [{ description: "X", qty: 1, price: 50000 }],
    });
    await asUserCommitted(
      u.recepA,
      (tx) =>
        tx`insert into public.payments (clinic_id, invoice_id, method, amount_centavos, status, provider, paid_at) values (${clinicA}, ${id}, 'cash', 50000, 'succeeded', 'manual', now())`,
    );
    expect(BigInt((await balance(u.ownerA)) ?? "0")).toBe(before);

    const id2 = await makeInvoice(u.recepA, {
      send: true,
      items: [{ description: "Y", qty: 1, price: 70000 }],
    });
    const ref = "link_" + Math.random().toString(36).slice(2, 12);
    await asUserCommitted(
      u.recepA,
      (tx) =>
        tx`insert into public.payments (clinic_id, invoice_id, amount_centavos, status, provider, provider_ref) values (${clinicA}, ${id2}, 70000, 'pending', 'paymongo', ${ref})`,
    );
    await applyEvent("evt_" + Math.random().toString(36).slice(2, 12), ref, 70000);
    expect(BigInt((await balance(u.ownerA)) ?? "0")).toBe(before + 70000n);
  });

  it("only owner and billing can see balance, payouts or request one", async () => {
    for (const who of [u.recepA, u.doctorA]) {
      const err = await failure(who, (tx) => tx`select public.clinic_balance(${clinicA})`);
      expect(err.code).toBe("42501");
      const po = await failure(
        who,
        (tx) => tx`select public.request_payout(${clinicA}, 100, 'BDO ••1920', current_date + 1)`,
      );
      expect(po.code).toBe("42501");
      await asUser(who, async (tx) =>
        expect(await tx`select 1 from public.payouts`).toHaveLength(0),
      );
    }
    const cross = await failure(u.ownerB, (tx) => tx`select public.clinic_balance(${clinicA})`);
    expect(cross.code).toBe("42501");
  });

  it("rejects a withdrawal above the balance and reduces the balance after a valid one", async () => {
    const bal = BigInt((await balance(u.billingA)) ?? "0");
    const tooMuch = await failure(
      u.billingA,
      (tx) =>
        tx`select public.request_payout(${clinicA}, ${(bal + 1n).toString()}, 'BDO ••1920', current_date + 1)`,
    );
    expect(tooMuch.message).toMatch(/more than the available balance/);
    await asUserCommitted(
      u.billingA,
      (tx) => tx`select public.request_payout(${clinicA}, 10000, 'BDO ••1920', current_date + 1)`,
    );
    expect(BigInt((await balance(u.billingA)) ?? "0")).toBe(bal - 10000n);
    const [p] = await admin<
      { is_mock: boolean; status: string }[]
    >`select is_mock, status from public.payouts where clinic_id = ${clinicA} order by created_at desc limit 1`;
    expect(p).toMatchObject({ is_mock: true, status: "processing" });
  });

  it("rejects zero or negative amounts and direct inserts", async () => {
    const zero = await failure(
      u.ownerA,
      (tx) => tx`select public.request_payout(${clinicA}, 0, 'BDO', current_date + 1)`,
    );
    expect(zero.code).toBe("22023");
    const direct = await failure(
      u.ownerA,
      (tx) =>
        tx`insert into public.payouts (clinic_id, amount_centavos, destination, arrives_on) values (${clinicA}, 1, 'x', current_date)`,
    );
    expect(direct.code).toBe("42501");
  });

  it("anonymous users cannot read billing tables", async () => {
    for (const t of ["invoices", "invoice_items", "payments", "payouts"]) {
      const err = await failure(null, (tx) => tx.unsafe(`select * from public.${t}`));
      expect(err.code, t).toBe("42501");
    }
  });
});
