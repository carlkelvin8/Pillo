import { describe, expect, it, vi } from "vitest";
import { createGeminiModelCall, GEMINI_REQUEST_OPTIONS } from "./gemini";

describe("Gemini model adapter", () => {
  it("uses bounded HTTP timeouts and disables the SDK's long default retry loop", () => {
    expect(GEMINI_REQUEST_OPTIONS).toMatchObject({
      timeout_ms: 10_000,
      retries: { strategy: "none" },
    });
  });

  it("uses the Interactions API with the shared system prompt, tools, and input", async () => {
    const create = vi.fn().mockResolvedValue({
      steps: [
        { type: "model_output", content: [{ type: "text", text: "Checking details." }] },
        { type: "function_call", id: "call-1", name: "lookup", arguments: { query: "hours" } },
        { type: "function_call", id: "call-2", name: "lookup", arguments: { query: "phone" } },
      ],
    });
    const call = createGeminiModelCall({
      apiKey: "test-key",
      client: { interactions: { create } } as never,
    });

    const response = await call({
      model: "gemini-test",
      system: "Be concise.",
      tools: [{ name: "lookup", description: "Read a fixture", parameters: { type: "object" } }],
      messages: [{ role: "user", content: "What are the hours and phone?" }],
    });

    expect(create).toHaveBeenCalledWith({
      model: "gemini-test",
      system_instruction: "Be concise.",
      tools: [{ type: "function", name: "lookup", description: "Read a fixture", parameters: { type: "object" } }],
      input: [{ type: "user_input", content: [{ type: "text", text: "What are the hours and phone?" }] }],
      store: false,
    }, GEMINI_REQUEST_OPTIONS);
    expect(response).toEqual({
      text: "Checking details.",
      toolCalls: [
        { id: "call-1", name: "lookup", input: { query: "hours" } },
        { id: "call-2", name: "lookup", input: { query: "phone" } },
      ],
      stopReason: "tool_use",
    });
  });

  it("sends previous function calls and their results as stateless interaction steps", async () => {
    const create = vi.fn().mockResolvedValue({
      steps: [{ type: "model_output", content: [{ type: "text", text: "The clinic is open weekdays." }] }],
    });
    const call = createGeminiModelCall({
      apiKey: "test-key",
      client: { interactions: { create } } as never,
    });

    const response = await call({
      model: "gemini-test",
      system: "Use fixtures only.",
      tools: [],
      messages: [
        { role: "user", content: "What are the hours?" },
        {
          role: "assistant",
          content: "",
          toolCalls: [{ id: "call-1", name: "get_clinic_info", input: {} }],
        },
        {
          role: "tool",
          toolResults: [{ callId: "call-1", name: "get_clinic_info", content: "{\"hours\":\"weekdays\"}", isError: false }],
        },
      ],
    });

    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      input: [
        { type: "user_input", content: [{ type: "text", text: "What are the hours?" }] },
        { type: "function_call", id: "call-1", name: "get_clinic_info", arguments: {} },
        { type: "function_result", call_id: "call-1", name: "get_clinic_info", result: "{\"hours\":\"weekdays\"}", is_error: false },
      ],
    }), GEMINI_REQUEST_OPTIONS);
    expect(response).toMatchObject({ text: "The clinic is open weekdays.", toolCalls: [], stopReason: "end" });
  });

  it("does not return malformed function arguments as trusted input", async () => {
    const create = vi.fn().mockResolvedValue({
      steps: [{ type: "function_call", name: "lookup", arguments: null }],
    });
    const call = createGeminiModelCall({
      apiKey: "test-key",
      client: { interactions: { create } } as never,
    });
    const response = await call({
      model: "m",
      system: "s",
      tools: [],
      messages: [{ role: "user", content: "go" }],
    });
    expect(response.toolCalls[0]?.input).toEqual({});
    expect(response.toolCalls[0]?.id).toMatch(/^missing-/);
    expect(response.stopReason).toBe("tool_use");
  });
});
