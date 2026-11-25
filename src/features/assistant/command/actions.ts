"use server";

import { z } from "zod";
import { logAudit } from "@/features/audit/log";
import { can } from "@/features/auth/permissions";
import { getWorkspace } from "@/features/auth/workspace";
import { createModelCall } from "@/features/assistant/chat-service";
import { DEFAULT_MODEL } from "@/features/assistant/chat-service";
import { echo, formString, validationFailed, type ActionState } from "@/lib/action-state";
import { rateLimit } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";
import { askOwner } from "./run";
import { createSupabaseMetricsSource } from "./source-supabase";

const questionSchema = z.object({
  question: z.string().trim().min(3, "Ask a question.").max(500, "Keep it under 500 characters."),
});

/** Owner-only. The question and answer are NOT stored; only that a question was asked is logged. */
export async function askOwnerAction(_p: ActionState, formData: FormData): Promise<ActionState> {
  const ws = await getWorkspace();
  if (!ws?.membership || !can(ws.membership.role, "staff.manage"))
    return { message: "You do not have permission to do that." };
  const parsed = questionSchema.safeParse({ question: formString(formData, "question") });
  if (!parsed.success) return validationFailed(parsed.error, formData, ["question"]);

  const call = createModelCall();
  if (!call)
    return {
      message:
        "Dr. Pill is paused for live clinic data. Use the local synthetic Gemini demo instead.",
    };
  if (!rateLimit(`ask:${ws.user.id}`, 20, 3600_000))
    return {
      message: "That's a lot of questions. Please try again in a little while.",
      values: echo(formData, ["question"]),
    };

  const clinic = ws.membership.clinic;
  try {
    const { reply } = await askOwner({
      source: createSupabaseMetricsSource(clinic.id, clinic.timezone),
      call,
      model: DEFAULT_MODEL,
      question: parsed.data.question,
      clinicName: clinic.name,
      tz: clinic.timezone,
      now: new Date(),
    });
    await logAudit(
      await createClient(),
      clinic.id,
      "assistant.owner_question",
      "clinic",
      clinic.id,
    );
    return { ok: true, message: "", data: { reply }, values: { question: parsed.data.question } };
  } catch {
    return {
      message: "Dr. Pill could not answer right now. Please try again.",
      values: echo(formData, ["question"]),
    };
  }
}
