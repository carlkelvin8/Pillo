import { GoogleGenAI } from "@google/genai";
import type { ModelCall, ModelMessage, ModelRequest, ModelResponse } from "./model";

type InteractionInputStep = Record<string, unknown>;

export const GEMINI_REQUEST_OPTIONS = {
  timeout_ms: 10_000,
  retries: { strategy: "none" },
} as const;

function asArguments(input: unknown): Record<string, unknown> {
  if (typeof input !== "object" || input === null || Array.isArray(input)) return {};
  return input as Record<string, unknown>;
}

function toInteractionInput(messages: ModelMessage[]): InteractionInputStep[] {
  return messages.flatMap((message) => {
    if (message.role === "tool") {
      return message.toolResults.map((result) => ({
        type: "function_result",
        call_id: result.callId,
        name: result.name,
        result: result.content,
        is_error: result.isError,
      }));
    }

    if (message.role === "assistant" && "toolCalls" in message) {
      const steps: InteractionInputStep[] = [];
      if (message.content) {
        steps.push({ type: "model_output", content: [{ type: "text", text: message.content }] });
      }
      steps.push(
        ...message.toolCalls.map((call) => ({
          type: "function_call",
          id: call.id,
          name: call.name,
          arguments: asArguments(call.input),
        })),
      );
      return steps;
    }

    return [
      {
        type: message.role === "assistant" ? "model_output" : "user_input",
        content: [{ type: "text", text: message.content }],
      },
    ];
  });
}

export function createGeminiModelCall(options: {
  apiKey: string;
  client?: GoogleGenAI;
}): ModelCall {
  const client = options.client ?? new GoogleGenAI({ apiKey: options.apiKey });
  return async (request: ModelRequest): Promise<ModelResponse> => {
    const interaction = await client.interactions.create(
      {
        model: request.model,
        system_instruction: request.system,
        tools: request.tools.map(({ name, description, parameters }) => ({
          type: "function",
          name,
          description,
          parameters,
        })),
        input: toInteractionInput(request.messages) as never,
        store: false,
      },
      GEMINI_REQUEST_OPTIONS,
    );

    const steps = interaction.steps ?? [];
    const text = steps
      .filter((step) => step.type === "model_output")
      .flatMap((step) => step.content ?? [])
      .flatMap((part) => (part.type === "text" ? [part.text] : []))
      .join("\n")
      .trim();
    const toolCalls = steps.flatMap((step, index) => {
      if (step.type !== "function_call") return [];
      return [
        {
          id: step.id || `missing-${index}`,
          name: step.name ?? "",
          input: asArguments(step.arguments),
        },
      ];
    });

    return {
      text,
      toolCalls,
      stopReason: toolCalls.length ? "tool_use" : "end",
    };
  };
}
