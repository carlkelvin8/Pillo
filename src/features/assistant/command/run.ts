import type { ModelCall, ModelMessage } from "@/features/assistant/agent/model";
import { formatDateLong, formatWeekday, todayIn } from "@/lib/datetime";
import { executeMetricTool, metricTools, type MetricsSource } from "./metrics";

export const COMMAND_MAX_STEPS = 6;
export const COMMAND_FALLBACK =
  "Sorry, I couldn't get those numbers right now. Please try again in a moment.";

export function commandSystemPrompt(clinicName: string, tz: string, now: Date): string {
  const today = todayIn(tz, now);
  return [
    `You are Dr. Pill, the assistant for the owner of ${clinicName}. Today is ${formatWeekday(today)} ${formatDateLong(today)} (${today}, ${tz}).`,
    "Answer questions about the clinic's business ONLY with numbers from your tools. Never guess, estimate or invent a figure. If a tool has no data, say so plainly.",
    "Money from tools comes with a formatted `pesos` string: quote it as given. Label the Chair-Filler recovered figure as an estimate.",
    "Compare periods by calling the tool once per period. Explain likely reasons only as possibilities backed by the numbers you have, and say what you could not check.",
    "You can suggest next steps (for example following up overdue invoices or reviewing the waitlist) but you cannot perform them. You cannot see patient names or records and never give medical advice.",
    "Keep answers short and plain: lead with the answer, then the key numbers. Reply in the language the owner used (English or Taglish).",
  ].join("\n");
}

/** One owner question. The model may call read-only metric tools; nothing is stored or changed. */
export async function askOwner(args: {
  source: MetricsSource;
  call: ModelCall;
  model: string;
  question: string;
  clinicName: string;
  tz: string;
  now: Date;
}): Promise<{ reply: string; steps: number }> {
  const system = commandSystemPrompt(args.clinicName, args.tz, args.now);
  const messages: ModelMessage[] = [{ role: "user", content: args.question }];
  for (let step = 1; step <= COMMAND_MAX_STEPS; step++) {
    const res = await args.call({
      model: args.model,
      system,
      tools: metricTools,
      messages,
    });
    if (res.stopReason === "tool_use") {
      messages.push({ role: "assistant", content: res.text, toolCalls: res.toolCalls });
      const results = [];
      for (const toolCall of res.toolCalls) {
        const r = await executeMetricTool(toolCall.name, toolCall.input, {
          source: args.source,
          tz: args.tz,
        });
        results.push({
          callId: toolCall.id,
          name: toolCall.name,
          content: r.content,
          isError: r.isError,
        });
      }
      messages.push({ role: "tool", toolResults: results });
      continue;
    }
    const text = res.text.trim();
    return { reply: text || COMMAND_FALLBACK, steps: step };
  }
  return { reply: COMMAND_FALLBACK, steps: COMMAND_MAX_STEPS };
}
