import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { acceptOffer, declineOffer, viewOffer } from "./accept";

const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const TOKEN = "t".repeat(43);
const NOW = new Date("2027-01-14T00:00:00Z"); // Thu 08:00 Manila
const offer = (over = {}) => ({
  id: U(1),
  clinic_id: U(2),
  branch_id: U(3),
  doctor_id: U(4),
  patient_id: U(5),
  waitlist_entry_id: U(6),
  starts_at: "2027-01-14T06:00:00Z",
  ends_at: "2027-01-14T06:30:00Z",
  status: "sent",
  expires_at: "2027-01-14T03:00:00Z",
  ...over,
});

type Call = { table: string; op: string; payload?: unknown };
type Script = {
  offer?: unknown;
  claim?: boolean;
  busy?: unknown[];
  hours?: unknown[];
  insertError?: { code: string } | null;
};
function fake(s: Script) {
  const calls: Call[] = [];
  const from = (table: string) => {
    let op = "select";
    let payload: unknown;
    const q: Record<string, unknown> = {};
    for (const m of ["select", "eq", "in", "lt", "gt", "order", "limit"]) q[m] = () => q;
    q.update = (p: unknown) => ((op = "update"), (payload = p), q);
    q.insert = (p: unknown) => ((op = "insert"), (payload = p), q);
    const done = () => {
      calls.push({ table, op, payload });
      if (op === "select" && table === "slot_offers") return { data: s.offer ?? null, error: null };
      if (op === "select" && table === "clinics")
        return { data: { name: "Sample", timezone: "Asia/Manila" }, error: null };
      if (op === "select" && table === "clinic_hours")
        return {
          data: s.hours ?? [{ weekday: 4, opens_at: "09:00", closes_at: "17:00" }],
          error: null,
        };
      if (op === "select" && table === "appointments") return { data: s.busy ?? [], error: null };
      if (op === "select") return { data: [], error: null };
      if (
        op === "update" &&
        table === "slot_offers" &&
        (payload as { status?: string }).status === "accepted"
      )
        return { data: s.claim === false ? [] : [{ id: U(1) }], error: null };
      if (op === "insert" && table === "appointments")
        return s.insertError
          ? { data: null, error: s.insertError }
          : { data: { id: U(9) }, error: null };
      return { data: [], error: null };
    };
    q.maybeSingle = () => Promise.resolve(done());
    q.single = () => Promise.resolve(done());
    q.then = (r: (v: unknown) => unknown) => Promise.resolve(done()).then(r);
    return q;
  };
  return { svc: { from } as unknown as SupabaseClient, calls };
}
const has = (c: Call[], table: string, op: string, match?: Record<string, unknown>) =>
  c.some(
    (x) =>
      x.table === table &&
      x.op === op &&
      (!match ||
        Object.entries(match).every(([k, v]) => (x.payload as Record<string, unknown>)?.[k] === v)),
  );

describe("acceptOffer", () => {
  it("books the slot, marks the offer and waitlist, expires siblings and logs it", async () => {
    const f = fake({ offer: offer() });
    expect(await acceptOffer(f.svc, TOKEN, NOW)).toBe("accepted");
    expect(has(f.calls, "appointments", "insert", { source: "ai", status: "scheduled" })).toBe(
      true,
    );
    expect(has(f.calls, "slot_offers", "update", { filled_appointment_id: U(9) })).toBe(true);
    expect(has(f.calls, "slot_offers", "update", { status: "expired" })).toBe(true);
    expect(has(f.calls, "waitlist_entries", "update", { status: "booked" })).toBe(true);
    expect(
      has(f.calls, "agent_actions", "insert", { kind: "chair_filler", status: "executed" }),
    ).toBe(true);
  });
  it("does nothing for an unapproved, expired or unknown token", async () => {
    for (const o of [
      offer({ status: "proposed" }),
      offer({ expires_at: "2027-01-13T00:00:00Z" }),
      null,
    ]) {
      const f = fake({ offer: o });
      expect(await acceptOffer(f.svc, TOKEN, NOW)).toBe("closed");
      expect(has(f.calls, "appointments", "insert")).toBe(false);
    }
  });
  it("rejects malformed tokens without querying", async () => {
    const f = fake({ offer: offer() });
    expect(await acceptOffer(f.svc, "short", NOW)).toBe("closed");
    expect(f.calls).toHaveLength(0);
  });
  it("lets only one request win the claim", async () => {
    const f = fake({ offer: offer(), claim: false });
    expect(await acceptOffer(f.svc, TOKEN, NOW)).toBe("closed");
    expect(has(f.calls, "appointments", "insert")).toBe(false);
  });
  it("reports taken and releases when someone booked the slot meanwhile", async () => {
    const f = fake({
      offer: offer(),
      busy: [{ id: U(7), starts_at: "2027-01-14T06:00:00Z", ends_at: "2027-01-14T06:30:00Z" }],
    });
    expect(await acceptOffer(f.svc, TOKEN, NOW)).toBe("taken");
    expect(has(f.calls, "appointments", "insert")).toBe(false);
    expect(has(f.calls, "agent_actions", "insert", { status: "failed" })).toBe(true);
  });
  it("maps a database overlap to taken", async () => {
    const f = fake({ offer: offer(), insertError: { code: "23P01" } });
    expect(await acceptOffer(f.svc, TOKEN, NOW)).toBe("taken");
    expect(has(f.calls, "waitlist_entries", "update")).toBe(false);
  });
});

describe("viewOffer / declineOffer", () => {
  it("shows only the first name and slot for an open offer", async () => {
    const f = fake({ offer: offer() });
    const v = await viewOffer(f.svc, TOKEN, NOW);
    expect(v.state).toBe("open");
  });
  it("reports invalid for unknown tokens", async () => {
    expect((await viewOffer(fake({ offer: null }).svc, TOKEN, NOW)).state).toBe("invalid");
  });
  it("declines only an open offer", async () => {
    const f = fake({ offer: offer() });
    await declineOffer(f.svc, TOKEN, NOW);
    expect(has(f.calls, "slot_offers", "update", { status: "declined" })).toBe(true);
    const g = fake({ offer: offer({ status: "proposed" }) });
    await declineOffer(g.svc, TOKEN, NOW);
    expect(has(g.calls, "slot_offers", "update")).toBe(false);
  });
});
