import { assistantSettingsSchema, type AssistantSettings } from "@/features/assistant/settings";
import type { ModelCall, ModelRequest, ModelResponse } from "./model";
import type { AgentStore, ClinicInfo, ConversationAppointment, HandoffReason, Rule } from "./store";

/** Test helpers only: an in-memory AgentStore and a scripted model. */
export const BRANCH = "11111111-1111-4111-8111-111111111111";
export const DOC = "22222222-2222-4222-8222-222222222222";
export const NOW = new Date("2027-01-11T02:00:00.000Z"); // Mon 11 Jan 2027, 10:00 in Manila
export const TUE = "2027-01-12";

export class FakeStore implements AgentStore {
  clinic: ClinicInfo;
  conversationId = "conv-1";
  created: { patientId: string; startsAt: string; doctorId: string }[] = [];
  moved: { id: string; startsAt: string }[] = [];
  records: { kind: string; status: string; payload: Record<string, unknown> }[] = [];
  handoffs: { reason: HandoffReason; summary: string }[] = [];
  patients: { fullName: string; phone: string; consent: boolean }[] = [];
  bookedToday = 0;
  bookingRule: Rule = { autonomy: "auto", dailyLimit: 5 };
  conversationAppt: ConversationAppointment | null = null;
  busy: { startsAt: string; endsAt: string }[] = [];
  createResult: "ok" | "conflict" = "ok";

  constructor(settings: Partial<AssistantSettings> = {}) {
    this.clinic = {
      id: "clinic-1",
      name: "Sample Dental",
      timezone: "Asia/Manila",
      address: "Fairview, QC",
      phone: "02 1234",
      settings: assistantSettingsSchema.parse(settings),
    };
  }
  async listBranches() {
    return [
      {
        id: BRANCH,
        name: "Main branch",
        address: "Fairview",
        phone: null,
        hours: [1, 2, 3, 4, 5].map((weekday) => ({ weekday, start: "09:00", end: "12:00" })),
      },
    ];
  }
  async listDoctors() {
    return [{ id: DOC, name: "Dr. Reyes", specialty: "General dentistry" }];
  }
  async slotContext() {
    return {
      branchHours: (await this.listBranches())[0]!.hours,
      doctorHours: [],
      booked: this.busy,
    };
  }
  async findOrCreatePatient(a: { fullName: string; phone: string; consent: boolean }) {
    this.patients.push(a);
    return { id: "patient-1" };
  }
  async linkPatient() {}
  async createAppointment(a: { patientId: string; startsAt: string; doctorId: string }) {
    if (this.createResult === "conflict")
      return { ok: false as const, reason: "conflict" as const };
    this.created.push(a);
    return { ok: true as const, id: "appt-1" };
  }
  async moveAppointment(a: { id: string; startsAt: string }) {
    this.moved.push(a);
    return { ok: true as const };
  }
  async getConversationAppointment(id: string) {
    return this.conversationAppt && this.conversationAppt.id === id ? this.conversationAppt : null;
  }
  async actionsToday() {
    return this.bookedToday;
  }
  async record(a: { kind: string; status: string; payload: Record<string, unknown> }) {
    this.records.push(a);
  }
  async rule() {
    return this.bookingRule;
  }
  async handoff(reason: HandoffReason, summary: string) {
    this.handoffs.push({ reason, summary });
  }
}

type TestBlock =
  { type: "text"; text: string } | { type: "tool_use"; id: string; name: string; input: unknown };
export const message = (
  content: TestBlock[],
  stop: "tool_use" | "end_turn" | "refusal",
): ModelResponse => ({
  text: content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("\n"),
  toolCalls: content
    .filter((block): block is Extract<TestBlock, { type: "tool_use" }> => block.type === "tool_use")
    .map(({ id, name, input }) => ({ id, name, input })),
  stopReason: stop === "end_turn" ? "end" : stop,
});
export const text = (t: string): TestBlock => ({ type: "text", text: t });
export const use = (name: string, input: unknown, id = "tu_1"): TestBlock => ({
  type: "tool_use",
  id,
  name,
  input,
});

export function scripted(...responses: ModelResponse[]): {
  call: ModelCall;
  calls: ModelRequest[];
} {
  const calls: ModelRequest[] = [];
  let i = 0;
  return {
    calls,
    call: async (p) => {
      calls.push(JSON.parse(JSON.stringify(p)));
      const r = responses[Math.min(i++, responses.length - 1)];
      if (!r) throw new Error("no scripted response");
      return r;
    },
  };
}
