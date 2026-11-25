import { createInterface } from "node:readline/promises";
import { existsSync, readFileSync } from "node:fs";
import { parse } from "dotenv";
import { stdin, stdout } from "node:process";
import { DEMO_MODEL, runGeminiDemo, SYNTHETIC_QUESTIONS } from "@/features/assistant/demo/run";

const env = process.env as Record<string, string | undefined>;
env.NODE_ENV ??= "development";
const localEnvPath = `${process.cwd()}/.env.local`;
const localEnv = existsSync(localEnvPath) ? parse(readFileSync(localEnvPath)) : {};

const apiKey = env.GEMINI_API_KEY || localEnv.GEMINI_API_KEY;
if (!apiKey) {
  console.error("Set GEMINI_API_KEY in .env.local to run the local synthetic demo.");
  process.exitCode = 1;
} else {
  const terminal = createInterface({ input: stdin, output: stdout });
  try {
    const model = env.GEMINI_MODEL || localEnv.GEMINI_MODEL || DEMO_MODEL;
    console.log(`Gemini local demo (${model}) — synthetic clinic only.`);
    SYNTHETIC_QUESTIONS.forEach((question, index) => console.log(`${index + 1}. ${question}`));
    const answer = await terminal.question("Choose a demo question (1-3): ");
    const index = Number(answer) - 1;
    const question = SYNTHETIC_QUESTIONS[index];
    if (!question) throw new Error("Choose a number from 1 to 3.");
    const result = await runGeminiDemo({ apiKey, model, question });
    console.log(
      `\n${result.reply}\n\n(${result.steps} model step${result.steps === 1 ? "" : "s"})`,
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : "The Gemini demo could not run.");
    process.exitCode = 1;
  } finally {
    terminal.close();
  }
}
