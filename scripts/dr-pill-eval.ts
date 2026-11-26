/**
 * Runs the Dr. Pill eval set against the real model on an in-memory SYNTHETIC clinic.
 * Local development only. Never reads Supabase and never sends clinic or patient data:
 * every case in src/features/assistant/eval/cases.ts is made up.
 *
 *   pnpm ai:eval                 all model cases
 *   pnpm ai:eval faq- book-      only cases whose id starts with one of these
 */
import { existsSync, readFileSync } from "node:fs";
import { parse } from "dotenv";
import { createGeminiModelCall } from "@/features/assistant/agent/gemini";
import type { ModelCall } from "@/features/assistant/agent/model";
import { DEFAULT_MODEL } from "@/features/assistant/chat-service";
import { EVAL_CASES } from "@/features/assistant/eval/cases";
import { runCase } from "@/features/assistant/eval/check";

const env = process.env as Record<string, string | undefined>;
env.NODE_ENV ??= "development";
if (env.NODE_ENV === "production") throw new Error("The eval runs in local development only.");

const localEnvPath = `${process.cwd()}/.env.local`;
const localEnv = existsSync(localEnvPath) ? parse(readFileSync(localEnvPath)) : {};
const apiKey = env.GEMINI_API_KEY || localEnv.GEMINI_API_KEY;
if (!apiKey) {
  console.error("Set GEMINI_API_KEY in .env.local to run the synthetic eval.");
  process.exit(1);
}
const model = env.GEMINI_MODEL || localEnv.GEMINI_MODEL || DEFAULT_MODEL;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Free tiers rate-limit and sometimes return 503: back off and retry a few times. */
function withRetry(call: ModelCall): ModelCall {
  return async (request) => {
    for (let attempt = 0; ; attempt++) {
      try {
        return await call(request);
      } catch (error) {
        const status = (error as { status?: number }).status;
        const reason = error instanceof Error ? error.message : "";
        // A daily quota will not clear in seconds: stop the whole run instead of burning more requests.
        if (status === 429 && /per day|daily/i.test(reason)) {
          console.error(`\nDaily quota reached, stopping the eval.\n${reason}`);
          process.exit(2);
        }
        const retryable = status === 429 || status === 503 || status === 504;
        if (!retryable || attempt >= 4) throw error;
        await sleep(2000 * (attempt + 1));
      }
    }
  };
}

const prefixes = process.argv.slice(2);
const cases = EVAL_CASES.filter(
  (c) => !c.detectorOnly && (prefixes.length === 0 || prefixes.some((p) => c.id.startsWith(p))),
);
const call = withRetry(createGeminiModelCall({ apiKey }));

console.log(`Dr. Pill eval (${model}) — ${cases.length} synthetic cases\n`);
const byCategory = new Map<string, { pass: number; total: number }>();
const failed: string[] = [];
let errored = 0;

for (const c of cases) {
  const tally = byCategory.get(c.category) ?? { pass: 0, total: 0 };
  tally.total += 1;
  try {
    const out = await runCase(c, call, model);
    if (out.passed) {
      tally.pass += 1;
      console.log(`PASS  ${c.id}`);
    } else {
      failed.push(c.id);
      console.log(`FAIL  ${c.id}  (${c.intent})`);
      for (const f of out.failures) console.log(`        - ${f}`);
      console.log(`        reply: ${out.reply.replace(/\s+/g, " ").slice(0, 220)}`);
    }
  } catch (error) {
    errored += 1;
    console.log(`ERROR ${c.id}  ${error instanceof Error ? error.message : "unknown error"}`);
  }
  byCategory.set(c.category, tally);
  await sleep(800);
}

console.log("\nBy category");
for (const [category, t] of byCategory)
  console.log(`  ${category.padEnd(14)} ${t.pass}/${t.total}`);
const passed = cases.length - failed.length - errored;
console.log(
  `\n${passed}/${cases.length} passed, ${failed.length} failed${errored ? `, ${errored} errored (provider errors, not agent failures)` : ""}.`,
);
console.log(
  "Note: one run is one sample. Models vary, so re-run failing cases a few times before changing the prompt.",
);
process.exit(failed.length === 0 && errored === 0 ? 0 : 1);
