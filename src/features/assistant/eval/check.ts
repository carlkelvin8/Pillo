import { runAgent, type ModelCall } from "@/features/assistant/agent/run";
import { FakeStore, NOW } from "@/features/assistant/agent/test-utils";
import type { EvalCase } from "./cases";

export type CaseOutcome = {
  id: string;
  passed: boolean;
  failures: string[];
  reply: string;
  steps: number;
};

type Observed = {
  reply: string;
  handedOff: boolean;
  handoffReasons: string[];
  booked: boolean;
  moved: boolean;
  patientSaved: boolean;
  consentRecorded: boolean;
};

/** Pure: compares what the agent did with what the case expects. Returns a list of failures. */
export function checkExpectation(c: EvalCase, seen: Observed): string[] {
  const e = c.expect;
  if (!e) return [];
  const out: string[] = [];
  if (e.handoff === "none" && seen.handedOff)
    out.push(`handed off (${seen.handoffReasons.join(",")}) but should not have`);
  if (Array.isArray(e.handoff)) {
    if (!seen.handedOff) out.push(`did not hand off (expected ${e.handoff.join("|")})`);
    else if (!seen.handoffReasons.some((r) => (e.handoff as string[]).includes(r)))
      out.push(`handed off as ${seen.handoffReasons.join(",")} (expected ${e.handoff.join("|")})`);
  }
  if (e.booked !== undefined && seen.booked !== e.booked)
    out.push(e.booked ? "no appointment was booked" : "an appointment was booked");
  if (e.moved !== undefined && seen.moved !== e.moved)
    out.push(e.moved ? "nothing was rescheduled" : "an appointment was rescheduled");
  if (e.patientSaved !== undefined && seen.patientSaved !== e.patientSaved)
    out.push(e.patientSaved ? "no patient was saved" : "a patient record was saved");
  if (
    e.consentRecorded !== undefined &&
    seen.patientSaved &&
    seen.consentRecorded !== e.consentRecorded
  )
    out.push(
      e.consentRecorded ? "consent was not recorded" : "consent was recorded without a clear yes",
    );
  for (const re of e.replyMustMatch ?? [])
    if (!re.test(seen.reply)) out.push(`reply should match ${re}`);
  for (const re of e.replyMustNotMatch ?? [])
    if (re.test(seen.reply)) out.push(`reply must not match ${re}`);
  return out;
}

/** Runs one case against `call` on an in-memory synthetic clinic. Never touches a database. */
export async function runCase(c: EvalCase, call: ModelCall, model: string): Promise<CaseOutcome> {
  const store = new FakeStore();
  const result = await runAgent({ store, call, model, history: c.history, now: NOW });
  const seen: Observed = {
    reply: result.reply,
    handedOff: result.handedOff || store.handoffs.length > 0,
    handoffReasons: store.handoffs.map((h) => h.reason),
    booked: store.created.length > 0,
    moved: store.moved.length > 0,
    patientSaved: store.patients.length > 0,
    consentRecorded: store.patients.every((p) => p.consent),
  };
  const failures = checkExpectation(c, seen);
  return {
    id: c.id,
    passed: failures.length === 0,
    failures,
    reply: result.reply,
    steps: result.steps,
  };
}
