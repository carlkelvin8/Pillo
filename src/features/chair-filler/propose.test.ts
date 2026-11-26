import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { proposeOffers } from "./propose";

const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const NOW = new Date(Date.UTC(2027, 0, 14, 0, 0));
const appt = {
  id: U(1),
  patient_id: U(10),
  doctor_id: U(2),
  branch_id: U(3),
  starts_at: "2027-01-14T06:00:00Z",
  ends_at: "2027-01-14T06:30:00Z",
};
const wait = (n: number, over = {}) => ({
  id: U(100 + n),
  patient_id: U(10 + n),
  branch_id: null,
  doctor_id: null,
  preferred_weekdays: [],
  earliest_time: null,
  latest_time: null,
  created_at: `2027-01-0${n}T00:00:00Z`,
  ...over,
});

type Tables = Record<string, unknown>;
function fake(t: Tables, upsertError: { code: string } | null = null) {
  const upsert = vi.fn();
  const statusFilters: unknown[] = [];
  const chain = (table: string) => {
    const errors = (t.errors ?? {}) as Record<string, { code: string } | undefined>;
    const failed = errors[table] ?? null;
    const result = {
      data: failed ? null : (t[table] ?? []),
      count: (t.count as number) ?? 0,
      error: failed,
    };
    const q: Record<string, unknown> = {};
    for (const m of ["select", "eq", "gte", "lt", "gt"]) q[m] = () => q;
    q.in = (col: string, values: unknown) => {
      if (col === "status") statusFilters.push(values);
      return q;
    };
    q.maybeSingle = () =>
      Promise.resolve({ data: table === "appointments" ? t.appt : t.rule, error: null });
    q.then = (r: (v: unknown) => unknown) => Promise.resolve(result).then(r);
    q.upsert = (rows: unknown[]) => {
      upsert(rows);
      return {
        select: () =>
          Promise.resolve({
            data: upsertError ? null : rows.map((_, i) => ({ id: U(900 + i) })),
            error: upsertError,
          }),
      };
    };
    return q;
  };
  return { client: { from: chain } as unknown as SupabaseClient, upsert, statusFilters };
}
const base = (over: Tables = {}): Tables => ({
  appt,
  rule: null,
  count: 0,
  waitlist_entries: [wait(1), wait(2)],
  patients: [
    { id: U(11), consent_at: "x" },
    { id: U(12), consent_at: "x" },
  ],
  ...over,
});
const run = (c: SupabaseClient) =>
  proposeOffers(c, { clinicId: U(50), appointmentId: U(1), tz: "Asia/Manila", now: NOW });

describe("proposeOffers", () => {
  it("offers the freed old time when an appointment was rescheduled", async () => {
    const f = fake(base());
    const freed = { startsAt: "2027-01-14T08:00:00Z", endsAt: "2027-01-14T08:30:00Z" };
    await proposeOffers(f.client, {
      clinicId: U(50),
      appointmentId: U(1),
      tz: "Asia/Manila",
      now: NOW,
      freed,
    });
    const rows = f.upsert.mock.calls[0]![0] as { starts_at: string; ends_at: string }[];
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.starts_at).toBe(freed.startsAt);
      expect(row.ends_at).toBe(freed.endsAt);
    }
  });

  it("proposes an offer per consented candidate", async () => {
    const f = fake(base());
    expect(await run(f.client)).toBe(2);
    const rows = f.upsert.mock.calls[0]![0] as { patient_id: string }[];
    expect(rows.map((r) => r.patient_id)).toEqual([U(11), U(12)]);
  });
  it("only filters busy patients by real appointment_status enum values", async () => {
    const f = fake(base());
    await run(f.client);
    // "arrived" is not in the enum: Postgres would reject the whole query and the busy check would silently vanish.
    expect(f.statusFilters).toEqual([["scheduled", "confirmed"]]);
  });
  it("skips patients without consent", async () => {
    const f = fake(base({ patients: [{ id: U(12), consent_at: "x" }] }));
    expect(await run(f.client)).toBe(1);
  });
  it("proposes nothing when the daily limit is used up", async () => {
    const f = fake(base({ rule: { daily_limit: 5 }, count: 5 }));
    expect(await run(f.client)).toBe(0);
    expect(f.upsert).not.toHaveBeenCalled();
  });
  it("caps offers at the remaining room", async () => {
    const f = fake(base({ rule: { daily_limit: 5 }, count: 4 }));
    expect(await run(f.client)).toBe(1);
  });
  it("never offers back to the patient who cancelled", async () => {
    const f = fake(base({ waitlist_entries: [wait(0)] }));
    expect(await run(f.client)).toBe(0);
  });
  it("returns 0 and logs the code (no throw) when saving fails", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const f = fake(base(), { code: "42P01" });
    expect(await run(f.client)).toBe(0);
    expect(spy).toHaveBeenCalledWith(expect.stringContaining("42P01"));
    spy.mockRestore();
  });
  it.each(["patients", "appointments"])(
    "drafts nothing and logs only the code when the %s lookup fails",
    async (table) => {
      const spy = vi.spyOn(console, "error").mockImplementation(() => {});
      const f = fake(base({ errors: { [table]: { code: "57014", message: "secret detail" } } }));
      expect(await run(f.client)).toBe(0);
      expect(f.upsert).not.toHaveBeenCalled();
      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy.mock.calls[0]).toHaveLength(1);
      expect(spy.mock.calls[0]![0]).toContain("57014");
      expect(spy.mock.calls[0]![0]).not.toContain("secret");
      spy.mockRestore();
    },
  );
});
