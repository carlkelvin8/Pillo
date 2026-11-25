"use server";

import { z } from "zod";
import { can } from "@/features/auth/permissions";
import { getWorkspace } from "@/features/auth/workspace";
import { echo, formString, validationFailed, type ActionState } from "@/lib/action-state";
import { serverEnv } from "@/lib/env-server";
import { rateLimit } from "@/lib/rate-limit";
import { runGeminiDemo, SYNTHETIC_QUESTIONS } from "./run";

const questionSchema = z.object({ question: z.enum(SYNTHETIC_QUESTIONS) });

function providerStatus(error: unknown): number | null {
  if (typeof error !== "object" || error === null || !("status" in error)) return null;
  return typeof error.status === "number" ? error.status : null;
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
    const message =
      status === 402
        ? "This AI Studio project has no available prepaid credits. For this demo, use a Free Tier project in AI Studio; you do not need to add billing."
        : status === 429
          ? "Gemini's request limit was reached. Wait a little and check the project's usage limits."
          : status === 401 || status === 403
            ? "Gemini rejected this key or project access. Check that the key belongs to a Gemini API project in AI Studio."
            : "The Gemini demo could not answer right now. Please try again.";
    return {
      message,
      values: echo(formData, ["question"]),
    };
  }
}
