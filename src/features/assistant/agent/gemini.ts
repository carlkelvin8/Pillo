import { FunctionCallingConfigMode, GoogleGenAI } from "@google/genai";
import type { ModelCall, ModelMessage, ModelRequest, ModelResponse } from "./model";

type ContentPart = Record<string, unknown>;

function toContents(messages: ModelMessage[]) {
  return messages.map((message) => {
    if (message.role === "tool") {
      return {
        role: "user",
        parts: message.toolResults.map((result) => ({
          functionResponse: {
            id: result.callId,
            name: result.name,
            response: { content: result.content, isError: result.isError },
          },
        })),
      };
    }
    if (message.role === "assistant" && "toolCalls" in message) {
      const parts: ContentPart[] = [];
      if (message.content) parts.push({ text: message.content });
      parts.push(
        ...message.toolCalls.map((call) => ({
          functionCall: { id: call.id, name: call.name, args: call.input },
        })),
      );
      return { role: "model", parts };
    }
    return {
      role: message.role === "assistant" ? "model" : "user",
      parts: [{ text: message.content }],
    };
  });
}

export function createGeminiModelCall(options: {
  apiKey: string;
  client?: GoogleGenAI;
}): ModelCall {
  const client = options.client ?? new GoogleGenAI({ apiKey: options.apiKey });
  return async (request: ModelRequest): Promise<ModelResponse> => {
    const result = await client.models.generateContent({
      model: request.model,
      contents: toContents(request.messages),
      config: {
        systemInstruction: request.system,
        tools: request.tools.length
          ? [
              {
                functionDeclarations: request.tools.map(({ name, description, parameters }) => ({
                  name,
                  description,
                  parameters,
                })),
              },
            ]
          : undefined,
        toolConfig: { functionCallingConfig: { mode: FunctionCallingConfigMode.AUTO } },
        automaticFunctionCalling: { disable: true },
      },
    });

    const candidate = result.candidates?.[0];
    const parts = candidate?.content?.parts ?? [];
    const text = parts
      .filter((part) => typeof part.text === "string")
      .map((part) => part.text)
      .join("\n")
      .trim();
    const toolCalls = parts.flatMap((part, index) => {
      if (!part.functionCall?.name) return [];
      return [
        {
          id: part.functionCall.id ?? `missing-${index}`,
          name: part.functionCall.name,
          input: part.functionCall.args ?? null,
        },
      ];
    });
    const stopReason = toolCalls.length
      ? "tool_use"
      : candidate?.finishReason === "SAFETY" || candidate?.finishReason === "BLOCKLIST"
        ? "refusal"
        : "end";
    return { text, toolCalls, stopReason };
  };
}
