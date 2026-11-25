import { runAgent } from "@/features/assistant/agent/run";
import { createGeminiModelCall } from "@/features/assistant/agent/gemini";
import { SyntheticStore } from "./synthetic-store";

export const DEMO_MODEL = "gemini-3.8-flash";
export const SYNTHETIC_QUESTIONS = [
  "What are the clinic hours?",
  "Where is the clinic located?",
  "Which doctors work at the clinic?",
] as const;

export async function runGeminiDemo(options: {
  apiKey: string;
  model?: string;
  question: string;
}): Promise<{ reply: string; steps: number }> {
  if (process.env.NODE_ENV !== "development" && process.env.NODE_ENV !== "test") {
    throw new Error("The Gemini synthetic demo is available in local development only.");
  }
  if (!(SYNTHETIC_QUESTIONS as readonly string[]).includes(options.question)) {
    throw new Error("Choose a synthetic demo question from the listed prompts.");
  }
  const store = new SyntheticStore();
  const call = createGeminiModelCall({ apiKey: options.apiKey });
  const result = await runAgent({
    store,
    call,
    model: options.model || DEMO_MODEL,
    history: [{ role: "user", content: options.question }],
    now: new Date(),
  });
  return { reply: result.reply, steps: result.steps };
}
