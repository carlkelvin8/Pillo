import { describe, expect, it } from "vitest";
import { assistantSettingsSchema, type AssistantSettings } from "@/features/assistant/settings";
import { generateSlots } from "@/features/scheduling/slots";
import {
  FALLBACK_REPLY,
  HANDOFF_REPLY,
  MAX_STEPS,
  normalizeHistory,
  runAgent,
  type ModelCall,
} from "./run";
import type { ConversationAppointment } from "./store";
import { BRANCH, DOC, FakeStore, NOW, TUE, message, scripted, text, use } from "./test-utils";
import { executeTool, toolDefinitions } from "./tools";

const hours = [{ weekday: 2, start: "09:00", end: "12:00" }];
const allSlots = generateSlots({
  date: TUE,
  tz: "Asia/Manila",
  branchHours: hours,
  doctorHours: [],
  booked: [],
  now: NOW,
});
const slot10 = allSlots[2]!; // 10:00
const slot11 = allSlots[4]!; // 11:00
const bookInput = (over: Record<string, unknown> = {}) => ({
  patient_name: "Juan Dela Cruz",
  phone: "0917 123 4567",
  doctor_id: DOC,
  branch_id: BRANCH,
  starts_at: slot10,
  consent_confirmed: true,
  ...over,
});
const ctx = (store: FakeStore) => ({ store, now: NOW });
const run = (
  store: FakeStore,
  call: ModelCall,
  history = [{ role: "user" as const, content: "hi" }],
) => runAgent({ store, call, model: "test-model", history, now: NOW });

describe("tool definitions", () => {
  it("offers only what the clinic enabled, and request_human always", () => {
    const names = (s: Partial<AssistantSettings>) =>
      toolDefinitions(assistantSettingsSchema.parse(s)).map((t) => t.name);
    expect(names({})).toEqual([
      "get_clinic_info",
      "list_open_slots",
      "book_appointment",
      "reschedule_appointment",
      "request_human",
    ]);
    expect(names({ book_appointments: false })).toEqual(["get_clinic_info", "request_human"]);
    expect(names({ answer_questions: false, book_appointments: false })).toEqual(["request_human"]);
  });
  it("no tool takes a clinic id: the model cannot choose a tenant", () => {
    for (const t of toolDefinitions(assistantSettingsSchema.parse({}))) {
      const props = Object.keys(
        (t.parameters as { properties?: Record<string, unknown> }).properties ?? {},
      );
      expect(props.filter((p) => /clinic|tenant/i.test(p))).toEqual([]);
    }
  });
});

describe("provider-neutral model loop", () => {
  it("returns each tool call and its matching result in the next request", async () => {
    const requests: Array<{ messages: Array<Record<string, unknown>> }> = [];
    const replies = [
      {
        text: "Checking clinic hours.",
        stopReason: "tool_use",
        toolCalls: [{ id: "call-1", name: "get_clinic_info", input: {} }],
      },
      { text: "We are open weekdays.", stopReason: "end", toolCalls: [] },
    ];
    const call = async (request: { messages: Array<Record<string, unknown>> }) => {
      requests.push(structuredClone(request));
      return replies.shift()!;
    };

    const result = await runAgent({
      store: new FakeStore(),
      call: call as never,
      model: "test-model",
      history: [{ role: "user", content: "Are you open?" }],
      now: NOW,
    });

    expect(result.reply).toBe("We are open weekdays.");
    expect(requests[1]?.messages.at(-2)).toEqual({
      role: "assistant",
      content: "Checking clinic hours.",
      toolCalls: [{ id: "call-1", name: "get_clinic_info", input: {} }],
    });
    expect(requests[1]?.messages.at(-1)).toMatchObject({
      role: "tool",
      toolResults: [{ callId: "call-1", name: "get_clinic_info", isError: false }],
    });
  });
});

describe("get_clinic_info and list_open_slots", () => {
  it("returns real clinic data", async () => {
    const r = await executeTool("get_clinic_info", {}, ctx(new FakeStore()));
    const data = JSON.parse(r.content);
    expect(r.isError).toBe(false);
    expect(data.clinic).toBe("Sample Dental");
    expect(data.branches[0].opening_hours).toContain("Mon: 09:00-12:00");
    expect(data.branches[0].opening_hours).toContain("Sun: closed");
    expect(data.doctors[0].id).toBe(DOC);
  });
  it("lists open slots and hides booked ones", async () => {
    const store = new FakeStore();
    store.busy = [
      {
        startsAt: slot10,
        endsAt: new Date(new Date(slot10).getTime() + 30 * 60_000).toISOString(),
      },
    ];
    const r = await executeTool("list_open_slots", { date: TUE, doctor_id: DOC }, ctx(store));
    const slots = JSON.parse(r.content).results[0].slots as { starts_at: string; label: string }[];
    expect(slots.length).toBeGreaterThan(0);
    expect(slots.map((s) => s.starts_at)).not.toContain(slot10);
    expect(slots[0]!.label).toMatch(/Tue January 12, 9:00 AM/);
  });
  it("rejects past dates, far dates and bad input", async () => {
    const store = new FakeStore();
    expect((await executeTool("list_open_slots", { date: "2027-01-10" }, ctx(store))).isError).toBe(
      true,
    );
    expect((await executeTool("list_open_slots", { date: "2027-06-01" }, ctx(store))).isError).toBe(
      true,
    );
    expect((await executeTool("list_open_slots", { date: "tomorrow" }, ctx(store))).isError).toBe(
      true,
    );
    expect(
      (await executeTool("list_open_slots", { date: TUE, doctor_id: "nope" }, ctx(store))).isError,
    ).toBe(true);
  });
});

describe("book_appointment", () => {
  it("books, saves the patient with consent, and logs an action without personal data", async () => {
    const store = new FakeStore();
    const r = await executeTool("book_appointment", bookInput(), ctx(store));
    expect(JSON.parse(r.content)).toMatchObject({
      status: "booked",
      appointment_id: "appt-1",
      doctor: "Dr. Reyes",
    });
    expect(store.created).toEqual([
      {
        branchId: BRANCH,
        patientId: "patient-1",
        doctorId: DOC,
        startsAt: slot10,
        endsAt: expect.any(String),
      },
    ]);
    expect(store.patients[0]).toMatchObject({
      fullName: "Juan Dela Cruz",
      phone: "09171234567",
      consent: true,
    });
    expect(JSON.stringify(store.records)).not.toMatch(/Juan|0917/);
    expect(store.records[0]).toMatchObject({ kind: "book_appointment", status: "executed" });
  });
  it("refuses without clear consent and creates nothing", async () => {
    const store = new FakeStore();
    const r = await executeTool(
      "book_appointment",
      bookInput({ consent_confirmed: false }),
      ctx(store),
    );
    expect(r.isError).toBe(true);
    expect(store.created).toHaveLength(0);
    expect(store.patients).toHaveLength(0);
  });
  it("validates name, phone, ids and time", async () => {
    const store = new FakeStore();
    for (const bad of [
      { patient_name: "J" },
      { phone: "12" },
      { doctor_id: "x" },
      { starts_at: "tomorrow 3pm" },
    ]) {
      expect(
        (await executeTool("book_appointment", bookInput(bad), ctx(store))).isError,
        JSON.stringify(bad),
      ).toBe(true);
    }
    expect(store.created).toHaveLength(0);
  });
  it("refuses unknown doctors and branches (no cross-clinic ids)", async () => {
    const store = new FakeStore();
    const r = await executeTool(
      "book_appointment",
      bookInput({ doctor_id: "33333333-3333-4333-8333-333333333333" }),
      ctx(store),
    );
    expect(r.isError).toBe(true);
    expect(store.created).toHaveLength(0);
  });
  it("refuses a time that is not an open slot", async () => {
    const store = new FakeStore();
    const r = await executeTool(
      "book_appointment",
      bookInput({ starts_at: "2027-01-12T05:15:00.000Z" }),
      ctx(store),
    );
    expect(r.isError).toBe(true);
    expect(store.created).toHaveLength(0);
  });
  it("tells the model when the slot was just taken", async () => {
    const store = new FakeStore();
    store.createResult = "conflict";
    const r = await executeTool("book_appointment", bookInput(), ctx(store));
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toMatch(/just taken/);
    expect(store.records[0]).toMatchObject({ status: "failed" });
  });
  it("hands over to staff when the clinic wants a human to finish bookings", async () => {
    const store = new FakeStore();
    store.bookingRule = { autonomy: "suggest", dailyLimit: 5 };
    const r = await executeTool("book_appointment", bookInput(), ctx(store));
    expect(r.handedOff).toBe(true);
    expect(store.created).toHaveLength(0);
    expect(store.handoffs[0]?.reason).toBe("booking");
    expect(store.records[0]).toMatchObject({ status: "proposed" });
  });
  it("hands over once the daily limit is reached", async () => {
    const store = new FakeStore();
    store.bookedToday = 5;
    const r = await executeTool("book_appointment", bookInput(), ctx(store));
    expect(r.handedOff).toBe(true);
    expect(store.created).toHaveLength(0);
  });
  it("is unavailable when the clinic switched booking off", async () => {
    const store = new FakeStore({ book_appointments: false });
    expect((await executeTool("book_appointment", bookInput(), ctx(store))).isError).toBe(true);
    expect(store.created).toHaveLength(0);
  });
});

describe("reschedule_appointment", () => {
  const own: ConversationAppointment = {
    id: "44444444-4444-4444-8444-444444444444",
    branchId: BRANCH,
    doctorId: DOC,
    startsAt: slot10,
    endsAt: new Date(new Date(slot10).getTime() + 30 * 60_000).toISOString(),
    status: "scheduled",
  };

  it("moves an appointment booked in this conversation", async () => {
    const store = new FakeStore();
    store.conversationAppt = own;
    const r = await executeTool(
      "reschedule_appointment",
      { appointment_id: own.id, new_starts_at: slot11 },
      ctx(store),
    );
    expect(JSON.parse(r.content).status).toBe("rescheduled");
    expect(store.moved).toEqual([{ id: own.id, startsAt: slot11, endsAt: expect.any(String) }]);
  });
  it("refuses any appointment not booked in this conversation", async () => {
    const store = new FakeStore();
    const r = await executeTool(
      "reschedule_appointment",
      { appointment_id: "55555555-5555-4555-8555-555555555555", new_starts_at: slot11 },
      ctx(store),
    );
    expect(r.isError).toBe(true);
    expect(store.moved).toHaveLength(0);
  });
  it("refuses cancelled or completed appointments", async () => {
    const store = new FakeStore();
    store.conversationAppt = { ...own, status: "cancelled" };
    expect(
      (
        await executeTool(
          "reschedule_appointment",
          { appointment_id: own.id, new_starts_at: slot11 },
          ctx(store),
        )
      ).isError,
    ).toBe(true);
  });
});

describe("request_human and unknown tools", () => {
  it("records the handoff and marks the turn as handed off", async () => {
    const store = new FakeStore();
    const r = await executeTool(
      "request_human",
      { reason: "medical", summary: "Asks about a rash" },
      ctx(store),
    );
    expect(r.handedOff).toBe(true);
    expect(store.handoffs).toEqual([{ reason: "medical", summary: "Asks about a rash" }]);
    expect(store.records[0]).toMatchObject({ kind: "handoff", payload: { reason: "medical" } });
  });
  it("rejects bad reasons and unknown tools without throwing", async () => {
    const store = new FakeStore();
    expect(
      (await executeTool("request_human", { reason: "lol", summary: "x" }, ctx(store))).isError,
    ).toBe(true);
    expect((await executeTool("delete_everything", {}, ctx(store))).isError).toBe(true);
  });
  it("turns store failures into a tool error", async () => {
    const store = new FakeStore();
    store.listDoctors = async () => {
      throw new Error("db down with secret details");
    };
    const r = await executeTool("get_clinic_info", {}, ctx(store));
    expect(r.isError).toBe(true);
    expect(r.content).not.toMatch(/secret/);
  });
});

describe("runAgent loop", () => {
  it("answers a question using every tool call and sends results back in one message", async () => {
    const store = new FakeStore();
    const { call, calls } = scripted(
      message([use("get_clinic_info", {}, "a"), use("get_clinic_info", {}, "b")], "tool_use"),
      message([text("Bukas po kami Mon-Fri, 9 AM to 12 NN.")], "end_turn"),
    );
    const r = await run(store, call);
    expect(r).toMatchObject({
      reply: "Bukas po kami Mon-Fri, 9 AM to 12 NN.",
      handedOff: false,
      steps: 2,
    });
    const second = calls[1]!.messages.at(-1)!;
    expect(second.role).toBe("tool");
    if (second.role !== "tool") throw new Error("expected tool results");
    expect(second.toolResults.map((b) => b.callId)).toEqual(["a", "b"]);
  });
  it("sends the model the system prompt and only enabled tools", async () => {
    const { call, calls } = scripted(message([text("Hello po!")], "end_turn"));
    await run(new FakeStore({ book_appointments: false }), call);
    const p = calls[0]!;
    expect(String(p.system)).toContain("Sample Dental");
    expect((p.tools as { name: string }[]).map((t) => t.name)).toEqual([
      "get_clinic_info",
      "request_human",
    ]);
    expect(p.model).toBe("test-model");
  });
  it("completes a full booking conversation", async () => {
    const store = new FakeStore();
    const { call } = scripted(
      message([use("list_open_slots", { date: TUE, doctor_id: DOC })], "tool_use"),
      message([use("book_appointment", bookInput())], "tool_use"),
      message([text("Naka-book na po kayo, Tue 12 Jan 10:00 AM.")], "end_turn"),
    );
    const r = await run(store, call, [{ role: "user", content: "gusto ko mag-book bukas 10am" }]);
    expect(r.reply).toMatch(/Naka-book/);
    expect(store.created).toHaveLength(1);
  });
  it("stops after a handoff and falls back to a kind default if the model says nothing", async () => {
    const store = new FakeStore();
    const { call } = scripted(
      message(
        [use("request_human", { reason: "medical", summary: "Medication question" })],
        "tool_use",
      ),
      message([], "end_turn"),
    );
    const r = await run(store, call);
    expect(r).toMatchObject({ handedOff: true, reply: HANDOFF_REPLY });
    expect(store.handoffs).toHaveLength(1);
  });
  it("gives the model a tool error for invalid input and lets it recover", async () => {
    const store = new FakeStore();
    const { call, calls } = scripted(
      message([use("list_open_slots", { date: "soon" })], "tool_use"),
      message([text("Anong petsa po?")], "end_turn"),
    );
    const r = await run(store, call);
    expect(r.reply).toBe("Anong petsa po?");
    const toolResult = calls[1]!.messages[2]!;
    expect(toolResult.role).toBe("tool");
    if (toolResult.role !== "tool") throw new Error("expected tool results");
    expect(toolResult.toolResults[0]!.isError).toBe(true);
  });
  it("hands over after too many tool rounds", async () => {
    const store = new FakeStore();
    const { call } = scripted(message([use("get_clinic_info", {})], "tool_use"));
    const r = await run(store, call);
    expect(r).toMatchObject({ handedOff: true, steps: MAX_STEPS, reply: HANDOFF_REPLY });
    expect(store.handoffs).toHaveLength(1);
  });
  it("hands over if the model refuses", async () => {
    const store = new FakeStore();
    const { call } = scripted(message([], "refusal"));
    const r = await run(store, call);
    expect(r.handedOff).toBe(true);
    expect(store.handoffs[0]?.reason).toBe("other");
  });
  it("falls back safely when there is no usable history", async () => {
    const { call } = scripted(message([text("x")], "end_turn"));
    const r = await run(new FakeStore(), call, [{ role: "assistant" as never, content: "orphan" }]);
    expect(r.reply).toBe(FALLBACK_REPLY);
  });
});

describe("normalizeHistory", () => {
  it("merges neighbours and starts with the user", () => {
    expect(
      normalizeHistory([
        { role: "assistant", content: "welcome" },
        { role: "user", content: "a" },
        { role: "user", content: "b" },
        { role: "assistant", content: "c" },
      ]),
    ).toEqual([
      { role: "user", content: "a\nb" },
      { role: "assistant", content: "c" },
    ]);
  });
});
