export type ModelTool = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
};

export type ModelToolCall = { id: string; name: string; input: unknown };
export type ModelToolResult = { callId: string; name: string; content: string; isError: boolean };
export type ModelMessage =
  | { role: "user" | "assistant"; content: string }
  | { role: "assistant"; content: string; toolCalls: ModelToolCall[] }
  | { role: "tool"; toolResults: ModelToolResult[] };
export type ModelRequest = {
  model: string;
  system: string;
  tools: ModelTool[];
  messages: ModelMessage[];
};
export type ModelResponse = {
  text: string;
  toolCalls: ModelToolCall[];
  stopReason: "end" | "tool_use" | "refusal";
};
export type ModelCall = (request: ModelRequest) => Promise<ModelResponse>;
