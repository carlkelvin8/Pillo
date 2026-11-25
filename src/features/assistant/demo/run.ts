import { createGeminiModelCall } from "@/features/assistant/agent/gemini";
import type { ModelCall } from "@/features/assistant/agent/model";
import { SyntheticStore } from "./synthetic-store";

export const DEMO_MODEL = "gemini-3.8-flash";
export const SYNTHETIC_QUESTIONS = [
  "What are the clinic hours?",
  "Where is the clinic located?",
  "Which doctors work at the clinic?",
] as const;

function providerStatus(error: unknown): number | null {
  if (typeof error !== "object" || error === null || !("status" in error)) return null;
  return typeof error.status === "number" ? error.status : null;
}

function isTransientProviderError(error: unknown): boolean {
  if (providerStatus(error) === 503 || providerStatus(error) === 504) return true;
  if (typeof error !== "object" || error === null || !("name" in error)) return false;
  return ["APIConnectionTimeoutError", "AbortError", "TimeoutError"].includes(String(error.name));
}

function withTransientRetry(call: ModelCall): ModelCall {
  return async (request) => {
    try {
      return await call(request);
    } catch (error) {
      if (!isTransientProviderError(error)) throw error;
      await new Promise((resolve) => setTimeout(resolve, 350));
      return call(request);
    }
  };
}

/** Runs one compact, fixed synthetic FAQ request with no clinic database or tools. */
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
  const [branches, doctors] = await Promise.all([store.listBranches(), store.listDoctors()]);
  const facts = [
    `Clinic: ${store.clinic.name}`,
    `Address: ${store.clinic.address}`,
    `Phone: ${store.clinic.phone}`,
    `Opening hours: ${branches.map((branch) => `${branch.name}: Monday to Friday, 9:00 AM to 5:00 PM`).join("; ")}`,
    `Doctors: ${doctors.map((doctor) => `${doctor.name} (${doctor.specialty})`).join(", ")}`,
  ].join("\n");
  const call = withTransientRetry(createGeminiModelCall({ apiKey: options.apiKey }));
  const result = await call({
    model: options.model || DEMO_MODEL,
    system: `You answer only fixed synthetic FAQ questions for a fictional demo clinic. Use no facts outside this data. If the question cannot be answered from the facts, say you do not have that demo information. Do not give medical advice or claim to access live clinic records.\n\n${facts}`,
    tools: [],
    messages: [{ role: "user", content: options.question }],
  });
  const reply = result.text.trim();
  if (!reply || result.stopReason !== "end") throw new Error("Gemini returned no synthetic FAQ answer.");
  return { reply, steps: 1 };
}
