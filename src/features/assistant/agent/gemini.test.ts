import { describe, expect, it, vi } from "vitest";
import { createGeminiModelCall } from "./gemini";

describe("Gemini model adapter", () => {
  it("converts the shared request and returns text together with multiple calls", async () => {
    const generateContent = vi.fn().mockResolvedValue({
      candidates: [
        {
          content: {
            parts: [
              { text: "Checking details." },
              { functionCall: { id: "call-1", name: "lookup", args: { query: "hours" } } },
              { functionCall: { id: "call-2", name: "lookup", args: { query: "phone" } } },
            ],
          },
        },
      ],
    });
    const call = createGeminiModelCall({
      apiKey: "test-key",
      client: { models: { generateContent } } as never,
    });
    const response = await call({
      model: "gemini-test",
      system: "Be concise.",
      tools: [{ name: "lookup", description: "Read a fixture", parameters: { type: "object" } }],
      messages: [{ role: "user", content: "What are the hours and phone?" }],
    });

    expect(generateContent).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "gemini-test",
        contents: [{ role: "user", parts: [{ text: "What are the hours and phone?" }] }],
      }),
    );
    expect(response).toEqual({
      text: "Checking details.",
      toolCalls: [
        { id: "call-1", name: "lookup", input: { query: "hours" } },
        { id: "call-2", name: "lookup", input: { query: "phone" } },
      ],
      stopReason: "tool_use",
    });
  });

  it("turns missing or non-object arguments into an invalid input value", async () => {
    const generateContent = vi.fn().mockResolvedValue({
      candidates: [{ content: { parts: [{ functionCall: { name: "lookup", args: null } }] } }],
    });
    const call = createGeminiModelCall({
      apiKey: "test-key",
      client: { models: { generateContent } } as never,
    });
    const response = await call({
      model: "m",
      system: "s",
      tools: [],
      messages: [{ role: "user", content: "go" }],
    });
    expect(response.toolCalls[0]?.input).toBeNull();
    expect(response.toolCalls[0]?.id).toMatch(/^missing-/);
    expect(response.stopReason).toBe("tool_use");
  });

  it("returns refusal for a blocked prompt and ordinary text for a final answer", async () => {
    const generateContent = vi
      .fn()
      .mockResolvedValueOnce({ candidates: [{ finishReason: "SAFETY", content: { parts: [] } }] })
      .mockResolvedValueOnce({ candidates: [{ content: { parts: [{ text: "Hello." }] } }] });
    const call = createGeminiModelCall({
      apiKey: "test-key",
      client: { models: { generateContent } } as never,
    });
    const request = {
      model: "m",
      system: "s",
      tools: [],
      messages: [{ role: "user" as const, content: "hi" }],
    };
    expect((await call(request)).stopReason).toBe("refusal");
    expect(await call(request)).toMatchObject({ text: "Hello.", toolCalls: [], stopReason: "end" });
  });
});
