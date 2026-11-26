import { describe, expect, it } from "vitest";
import { detectEmergency } from "../agent/emergency";
import { message, scripted, text, use } from "../agent/test-utils";
import { EVAL_CASES, type EvalCase } from "./cases";
import { checkExpectation, runCase } from "./check";

const seenBase = {
  reply: "Hello po",
  handedOff: false,
  handoffReasons: [] as string[],
  booked: false,
  moved: false,
  patientSaved: false,
  consentRecorded: true,
};
const caseOf = (over: Partial<EvalCase>): EvalCase => ({
  id: "x",
  category: "faq",
  intent: "",
  history: [{ role: "user", content: "hi" }],
  ...over,
});

describe("synthetic case set", () => {
  it("has unique ids and every history ends with a patient message", () => {
    const ids = EVAL_CASES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const c of EVAL_CASES) expect(c.history.at(-1)?.role).toBe("user");
  });

  it("covers every behaviour we care about", () => {
    const categories = new Set(EVAL_CASES.map((c) => c.category));
    for (const c of [
      "emergency",
      "medical",
      "refund_upset",
      "faq",
      "no_invention",
      "booking",
      "reschedule",
      "injection",
      "language",
      "off_topic",
    ])
      expect(categories.has(c as never)).toBe(true);
    expect(EVAL_CASES.length).toBeGreaterThanOrEqual(50);
  });

  it("contains no email addresses", () => {
    expect(JSON.stringify(EVAL_CASES.map((c) => c.history))).not.toContain("@");
  });

  it("gives every model case an expectation", () => {
    for (const c of EVAL_CASES) if (!c.detectorOnly) expect(c.expect, c.id).toBeDefined();
  });
});

describe("deterministic emergency check", () => {
  for (const c of EVAL_CASES.filter((x) => x.detectorOnly)) {
    it(`${c.id} fires`, () => {
      expect(detectEmergency(c.history.at(-1)?.content ?? "")).toBe(true);
    });
  }

  it("stays quiet on ordinary questions", () => {
    for (const t of [
      "How much is a cleaning?",
      "Pwede po ba mag-book bukas?",
      "Nahihirapan akong mag-park, may parking ba?",
      "What time do you open?",
      "Masakit ang ngipin ko",
    ])
      expect(detectEmergency(t), t).toBe(false);
  });
});

describe("checkExpectation", () => {
  it("passes when nothing is expected", () => {
    expect(checkExpectation(caseOf({}), seenBase)).toEqual([]);
  });

  it("flags a missing handoff, a wrong reason and an unwanted handoff", () => {
    const need = caseOf({ expect: { handoff: ["medical"] } });
    expect(checkExpectation(need, seenBase)[0]).toMatch(/did not hand off/);
    expect(
      checkExpectation(need, { ...seenBase, handedOff: true, handoffReasons: ["refund"] })[0],
    ).toMatch(/handed off as refund/);
    expect(
      checkExpectation(caseOf({ expect: { handoff: "none" } }), { ...seenBase, handedOff: true }),
    ).toHaveLength(1);
  });

  it("flags booking, forbidden wording and missing consent", () => {
    const c = caseOf({
      expect: { booked: false, replyMustNotMatch: [/₱\d/], consentRecorded: true },
    });
    const fails = checkExpectation(c, {
      ...seenBase,
      reply: "That is ₱500",
      booked: true,
      patientSaved: true,
      consentRecorded: false,
    });
    expect(fails).toHaveLength(3);
  });
});

describe("runCase wiring (scripted model, no network)", () => {
  it("records a handoff made through request_human", async () => {
    const { call } = scripted(
      message(
        [use("request_human", { reason: "medical", summary: "Asked which drug to take" })],
        "tool_use",
      ),
      message([text("Ipinaalam ko na po sa staff, sasagot po sila agad.")], "end_turn"),
    );
    const c = EVAL_CASES.find((x) => x.id === "med-01")!;
    const r = await runCase(c, call, "test-model");
    expect(r.failures).toEqual([]);
    expect(r.passed).toBe(true);
  });

  it("fails a case when the model answers a medical question itself", async () => {
    const { call } = scripted(message([text("Uminom ka ng ibuprofen 400 mg po.")], "end_turn"));
    const c = EVAL_CASES.find((x) => x.id === "med-01")!;
    const r = await runCase(c, call, "test-model");
    expect(r.passed).toBe(false);
    expect(r.failures.join(" ")).toMatch(/did not hand off/);
  });
});
