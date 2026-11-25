"use server";

import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { can } from "@/features/auth/permissions";
import { getWorkspace } from "@/features/auth/workspace";
import { echo, formString, validationFailed, type ActionState } from "@/lib/action-state";
import { serverEnv } from "@/lib/env-server";
import { rateLimit } from "@/lib/rate-limit";
import { runGeminiDemo, SYNTHETIC_QUESTIONS } from "./run";
import { DEMO_VOICE_LINES } from "./voice-lines";

const questionSchema = z.object({ question: z.enum(SYNTHETIC_QUESTIONS) });
const voiceLineSchema = z.object({
  lineId: z.enum(
    Object.keys(DEMO_VOICE_LINES) as [
      keyof typeof DEMO_VOICE_LINES,
      ...(keyof typeof DEMO_VOICE_LINES)[],
    ],
  ),
});

function providerStatus(error: unknown): number | null {
  if (typeof error !== "object" || error === null || !("status" in error)) return null;
  return typeof error.status === "number" ? error.status : null;
}

function isProviderTimeout(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const name = "name" in error ? error.name : null;
  return (
    name === "APIConnectionTimeoutError" ||
    name === "AbortError" ||
    name === "TimeoutError" ||
    providerStatus(error) === 408 ||
    providerStatus(error) === 504
  );
}

/** Runs only fixed synthetic prompts, with no clinic or patient data. */
export async function runSyntheticDemoAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ws = await getWorkspace();
  if (!ws?.membership || !can(ws.membership.role, "staff.manage"))
    return { message: "You do not have permission to run this demo." };

  const parsed = questionSchema.safeParse({ question: formString(formData, "question") });
  if (!parsed.success) return validationFailed(parsed.error, formData, ["question"]);
  if (process.env.NODE_ENV !== "development")
    return { message: "The synthetic Gemini demo is available only in local development." };

  const { GEMINI_API_KEY, GEMINI_MODEL } = serverEnv();
  if (!GEMINI_API_KEY)
    return {
      message: "Add GEMINI_API_KEY to .env.local, then restart pnpm dev to run the demo.",
      values: echo(formData, ["question"]),
    };
  if (!rateLimit(`synthetic-demo:${ws.user.id}`, 20, 3600_000))
    return {
      message: "Demo limit reached. Please try again in a little while.",
      values: echo(formData, ["question"]),
    };

  try {
    const result = await runGeminiDemo({
      apiKey: GEMINI_API_KEY,
      model: GEMINI_MODEL,
      question: parsed.data.question,
    });
    return {
      ok: true,
      message: "Answered using synthetic demo data.",
      data: { reply: result.reply, steps: String(result.steps) },
      values: { question: parsed.data.question },
    };
  } catch (error) {
    const status = providerStatus(error);
    const message = isProviderTimeout(error)
      ? "Gemini took too long to respond. Please try the synthetic demo again."
      : status === 402
        ? "This AI Studio project has no available prepaid credits. For this demo, use a Free Tier project in AI Studio; you do not need to add billing."
        : status === 429
          ? "Gemini's Free Tier request limit has been reached. Wait for the quota reset or review the project's usage limits."
          : status === 503
            ? "Gemini is temporarily experiencing high demand. Please try the synthetic demo again in a minute."
            : status === 401 || status === 403
              ? "Gemini rejected this key or project access. Check that the key belongs to a Gemini API project in AI Studio."
              : "The Gemini demo could not answer right now. Please try again.";
    return {
      message,
      values: echo(formData, ["question"]),
    };
  }
}

/** Generates audio only from a fixed fictional demo line. Never accepts free-form text. */
export async function synthesizeDemoVoiceAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ws = await getWorkspace();
  if (!ws?.membership || !can(ws.membership.role, "staff.manage"))
    return { message: "You do not have permission to run this demo." };
  if (process.env.NODE_ENV !== "development")
    return { message: "Demo voice is available only in local development." };

  const parsed = voiceLineSchema.safeParse({ lineId: formString(formData, "lineId") });
  if (!parsed.success) return validationFailed(parsed.error, formData);

  const line = DEMO_VOICE_LINES[parsed.data.lineId];
  const { GEMINI_API_KEY } = serverEnv();
  if (!GEMINI_API_KEY)
    return { message: "Gemini voice is unavailable; use your device voice instead." };
  if (!rateLimit(`synthetic-demo-voice:${ws.user.id}`, 20, 3600_000))
    return { message: "Demo voice limit reached. Please try again shortly." };

  try {
    const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY, httpOptions: { apiVersion: "v1beta" } });
    const interaction = await ai.interactions.create({
      model: "gemini-3.8-flash-tts",
      input: [
        {
          type: "user_input",
          content: [
            {
              type: "text",
              text: line,
              annotations: [
                { type: "speech_metadata", style: "warm, playful, friendly, and clear" },
              ],
            },
          ],
        },
      ],
      response_format: { type: "audio" },
      generation_config: { speech_config: [{ voice: "Kore" }] },
      store: false,
    });
    const audioBase64 = interaction.output_audio?.data;
    if (!audioBase64)
      return { message: "Gemini voice is unavailable; use your device voice instead." };
    return { ok: true, message: "Synthetic demo voice ready.", data: { audioBase64 } };
  } catch {
    return { message: "Gemini voice is unavailable; use your device voice instead." };
  }
}
