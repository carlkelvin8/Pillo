import type { ModelCall, ModelMessage, ModelTool } from "./model";
export type { ModelCall } from "./model";
import { buildSystemPrompt } from "./prompt";
import type { AgentStore } from "./store";
import { executeTool, toolDefinitions } from "./tools";
import { formatDateLong, formatTime, formatWeekday, todayIn } from "@/lib/datetime";

export type HistoryMessage = { role: "user" | "assistant"; content: string };
export type AgentResult = { reply: string; handedOff: boolean; steps: number };

export const MAX_STEPS = 6;
export const FALLBACK_REPLY =
  "Pasensya na po, may problema sa sistema ko ngayon. Ipinaalam ko na sa staff namin at babalikan ko kayo agad.";
export const HANDOFF_REPLY =
  "Ipinasa ko na po ito sa staff namin. Sasagot po sila sa lalong madaling panahon.";

/** The API needs alternating roles starting with the user. Merge neighbours and drop a leading assistant turn. */
export function normalizeHistory(history: HistoryMessage[]): ModelMessage[] {
  const out: HistoryMessage[] = [];
  for (const m of history) {
    const last = out[out.length - 1];
    if (last && last.role === m.role) last.content += `\n${m.content}`;
    else out.push({ ...m });
  }
  while (out[0]?.role === "assistant") out.shift();
  return out.map((m) => ({ role: m.role, content: m.content }));
}

/**
 * One patient turn. Runs the tool loop until the model answers, hands over, or hits MAX_STEPS.
 * `call` is injected so tests can script the model.
 */
export async function runAgent(args: {
  store: AgentStore;
  call: ModelCall;
  model: string;
  history: HistoryMessage[];
  now: Date;
}): Promise<AgentResult> {
  const { store, call, model, now } = args;
  const tz = store.clinic.timezone;
  const today = todayIn(tz, now);
  const nowLabel = `${formatWeekday(today)} ${formatDateLong(today)}, ${formatTime(now.toISOString(), tz)} (${tz}). Today is ${today}.`;
  const system = buildSystemPrompt(store.clinic, nowLabel);
  const tools = toolDefinitions(store.clinic.settings);
  const messages: ModelMessage[] = normalizeHistory(args.history);
  if (messages.length === 0) return { reply: FALLBACK_REPLY, handedOff: false, steps: 0 };

  let handedOff = false;
  for (let step = 1; step <= MAX_STEPS; step++) {
    const response = await call({
      model,
      system,
      tools: tools as ModelTool[],
      messages,
    });

    if (response.stopReason === "refusal") {
      await store.handoff("other", "The assistant could not continue this conversation.");
      return { reply: HANDOFF_REPLY, handedOff: true, steps: step };
    }

    if (response.stopReason === "tool_use") {
      messages.push({ role: "assistant", content: response.text, toolCalls: response.toolCalls });
      const results = [];
      for (const toolCall of response.toolCalls) {
        const r = await executeTool(toolCall.name, toolCall.input, { store, now });
        if (r.handedOff) handedOff = true;
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

    return {
      reply: response.text.trim() || (handedOff ? HANDOFF_REPLY : FALLBACK_REPLY),
      handedOff,
      steps: step,
    };
  }

  // Too many tool rounds: stop and let a person take over.
  await store.handoff("other", "The assistant needed too many steps and stopped.");
  return { reply: HANDOFF_REPLY, handedOff: true, steps: MAX_STEPS };
}
