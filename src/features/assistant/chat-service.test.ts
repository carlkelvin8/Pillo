import { describe, expect, it } from "vitest";
import type { HistoryMessage } from "./agent/run";
import { BRANCH, DOC, FakeStore, message, scripted, text, use } from "./agent/test-utils";
import {
  BUSY_REPLY,
  cleanMessage,
  handleTurn,
  hashToken,
  MAX_MESSAGE_CHARS,
  newToken,
  tokenMatches,
  type TurnDeps,
} from "./chat-service";
import { EMERGENCY_REPLY } from "./agent/emergency";
import { chatConfigured, createModelCall } from "./chat-service";

function deps(store: FakeStore, history: HistoryMessage[] = [{ role: "user", content: "hi" }]) {
  const saved: { role: string; content: string }[] = [];
  let reopened = false;
  const d: TurnDeps = {
    store,
    addMessage: async (role, _by, content) => {
      saved.push({ role, content });
    },
    reopenResolved: async () => {
      reopened = true;
    },
    history: async () => history,
  };
  return { d, saved, reopened: () => reopened };
}
const open = { status: "open" as const, handledBy: "ai" as const };

describe("tokens", () => {
  it("are long, unique, and only their hash verifies", () => {
    const a = newToken();
    const b = newToken();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(40);
    expect(tokenMatches(a, hashToken(a))).toBe(true);
    expect(tokenMatches(b, hashToken(a))).toBe(false);
    expect(tokenMatches("", hashToken(a))).toBe(false);
  });
});

describe("cleanMessage", () => {
  it("trims, strips control characters and caps length", () => {
    expect(cleanMessage("  hello\u0000 po\u0007  ")).toBe("hello po");
    expect(cleanMessage("   ")).toBeNull();
    expect(cleanMessage("a".repeat(5000))).toHaveLength(MAX_MESSAGE_CHARS);
    expect(cleanMessage("line1\nline2")).toBe("line1\nline2");
  });
});

describe("live AI configuration", () => {
  it("keeps clinic chat disabled even when Gemini credentials are present", () => {
    const previousGemini = process.env.GEMINI_API_KEY;
    const previousSupabase = process.env.SUPABASE_SERVICE_ROLE_KEY;
    process.env.GEMINI_API_KEY = "test-gemini-key";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-key";
    try {
      expect(chatConfigured()).toEqual({ ok: false, missing: "AI_PROVIDER_NOT_CONFIGURED" });
      expect(createModelCall()).toBeNull();
    } finally {
      if (previousGemini === undefined) delete process.env.GEMINI_API_KEY;
      else process.env.GEMINI_API_KEY = previousGemini;
      if (previousSupabase === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
      else process.env.SUPABASE_SERVICE_ROLE_KEY = previousSupabase;
    }
  });
});

describe("handleTurn safeguards", () => {
  it("queues the message for staff and does NOT call the model when a human owns the chat", async () => {
    const store = new FakeStore();
    const { d, saved } = deps(store);
    const { call, calls } = scripted(message([text("should never run")], "end_turn"));
    const r = await handleTurn({
      deps: d,
      conversation: { status: "needs_human", handledBy: "human" },
      text: "hello?",
      call,
      model: "m",
    });
    expect(r).toEqual({ reply: null, status: "human", handedOff: true });
    expect(calls).toHaveLength(0);
    expect(saved).toEqual([{ role: "patient", content: "hello?" }]);
  });

  it("answers emergencies deterministically, without the model, and hands over", async () => {
    const store = new FakeStore();
    const { d, saved } = deps(store);
    const { call, calls } = scripted(message([text("x")], "end_turn"));
    const r = await handleTurn({
      deps: d,
      conversation: open,
      text: "my father has chest pain",
      call,
      model: "m",
    });
    expect(r.reply).toBe(EMERGENCY_REPLY);
    expect(r.reply).toMatch(/911/);
    expect(calls).toHaveLength(0);
    expect(store.handoffs[0]?.reason).toBe("medical");
    expect(saved.map((m) => m.role)).toEqual(["patient", "assistant"]);
  });

  it("stops calling the model once the clinic's daily reply cap is reached", async () => {
    const store = new FakeStore();
    store.bookedToday = 10_000;
    store.bookingRule = { autonomy: "auto", dailyLimit: 300 };
    const { d } = deps(store);
    const { call, calls } = scripted(message([text("x")], "end_turn"));
    const r = await handleTurn({ deps: d, conversation: open, text: "hello", call, model: "m" });
    expect(r.reply).toBe(BUSY_REPLY);
    expect(calls).toHaveLength(0);
    expect(store.handoffs).toHaveLength(1);
  });

  it("reopens a resolved conversation and answers normally", async () => {
    const store = new FakeStore();
    const { d, reopened } = deps(store);
    const { call } = scripted(message([text("Kumusta po!")], "end_turn"));
    const r = await handleTurn({
      deps: d,
      conversation: { status: "resolved", handledBy: "ai" },
      text: "hi again",
      call,
      model: "m",
    });
    expect(reopened()).toBe(true);
    expect(r).toMatchObject({ reply: "Kumusta po!", status: "ai", handedOff: false });
    expect(store.records.at(-1)).toMatchObject({ kind: "reply", status: "executed" });
  });

  it("hands over with a kind message when the model call fails", async () => {
    const store = new FakeStore();
    const { d, saved } = deps(store);
    const r = await handleTurn({
      deps: d,
      conversation: open,
      text: "hello",
      call: async () => {
        throw new Error("network down");
      },
      model: "m",
    });
    expect(r.status).toBe("human");
    expect(r.reply).toMatch(/Pasensya/);
    expect(store.handoffs[0]?.reason).toBe("other");
    expect(store.records.at(-1)).toMatchObject({ kind: "reply", status: "failed" });
    expect(saved.at(-1)?.role).toBe("assistant");
  });

  it("reports a handoff when the agent used request_human", async () => {
    const store = new FakeStore();
    const { d } = deps(store, [{ role: "user", content: "Pwede po bang uminom ng ibuprofen?" }]);
    const { call } = scripted(
      message(
        [use("request_human", { reason: "medical", summary: "Asks about medication" })],
        "tool_use",
      ),
      message([text("Ipapasa ko po ito sa staff namin, sasagot po sila agad.")], "end_turn"),
    );
    const r = await handleTurn({
      deps: d,
      conversation: open,
      text: "Pwede po bang uminom ng ibuprofen?",
      call,
      model: "m",
    });
    expect(r.status).toBe("human");
    expect(store.handoffs[0]).toEqual({ reason: "medical", summary: "Asks about medication" });
  });

  it("books through the whole stack when the patient has agreed", async () => {
    const store = new FakeStore();
    const { d } = deps(store);
    const slot = "2027-01-12T02:00:00.000Z"; // 10:00 Manila on Tue 12 Jan
    const { call } = scripted(
      message(
        [
          use("book_appointment", {
            patient_name: "Maria Santos",
            phone: "09171234567",
            doctor_id: DOC,
            branch_id: BRANCH,
            starts_at: slot,
            consent_confirmed: true,
          }),
        ],
        "tool_use",
      ),
      message([text("Naka-book na po!")], "end_turn"),
    );
    const r = await handleTurn({
      deps: d,
      conversation: open,
      text: "yes, book 10am please",
      call,
      model: "m",
      now: new Date("2027-01-11T02:00:00.000Z"),
    });
    expect(r.reply).toBe("Naka-book na po!");
    expect(store.created).toHaveLength(1);
  });
});
