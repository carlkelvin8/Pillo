import { afterEach, describe, expect, it, vi } from "vitest";

const modelCall = vi.fn();
vi.mock("@/features/assistant/agent/gemini", () => ({
  createGeminiModelCall: () => modelCall,
}));

import { runGeminiDemo } from "./run";
const env = process.env as Record<string, string | undefined>;

const oldNodeEnv = process.env.NODE_ENV;
afterEach(() => {
  vi.clearAllMocks();
  if (oldNodeEnv === undefined) delete env.NODE_ENV;
  else env.NODE_ENV = oldNodeEnv;
});

describe("local synthetic Gemini demo", () => {
  it("refuses production before constructing the Gemini model call", async () => {
    env.NODE_ENV = "production";
    await expect(
      runGeminiDemo({ apiKey: "test-key", question: "What are the clinic hours?" }),
    ).rejects.toThrow(/local development only/i);
    expect(modelCall).not.toHaveBeenCalled();
  });

  it("answers an allowlisted question in one call with compact synthetic-only context and no tools", async () => {
    env.NODE_ENV = "development";
    modelCall.mockResolvedValueOnce({
      text: "Open Monday to Friday, 9 AM to 5 PM.",
      stopReason: "end",
      toolCalls: [],
    });
    const result = await runGeminiDemo({
      apiKey: "test-key",
      question: "What are the clinic hours?",
    });
    expect(result).toEqual({ reply: "Open Monday to Friday, 9 AM to 5 PM.", steps: 1 });
    expect(modelCall).toHaveBeenCalledTimes(1);
    expect(modelCall).toHaveBeenCalledWith(expect.objectContaining({
      tools: [],
      messages: [{ role: "user", content: "What are the clinic hours?" }],
      system: expect.stringContaining("Demo Family Dental"),
    }));
    expect(JSON.stringify(modelCall.mock.calls[0]?.[0])).toContain("123 Sampaguita Street");
  });

  it("rejects questions outside the synthetic fixture prompts", async () => {
    env.NODE_ENV = "development";
    await expect(
      runGeminiDemo({ apiKey: "test-key", question: "What is Juan's diagnosis?" }),
    ).rejects.toThrow(/synthetic demo question/i);
    expect(modelCall).not.toHaveBeenCalled();
  });

  it("retries once when Gemini is temporarily unavailable", async () => {
    env.NODE_ENV = "development";
    modelCall
      .mockRejectedValueOnce(Object.assign(new Error("temporarily unavailable"), { status: 503 }))
      .mockResolvedValueOnce({
        text: "Open weekdays from 9 AM to 5 PM.",
        stopReason: "end",
        toolCalls: [],
      });

    const result = await runGeminiDemo({
      apiKey: "test-key",
      question: "What are the clinic hours?",
    });

    expect(result.reply).toBe("Open weekdays from 9 AM to 5 PM.");
    expect(modelCall).toHaveBeenCalledTimes(2);
  });

  it("retries once when Gemini's request deadline expires", async () => {
    env.NODE_ENV = "development";
    modelCall
      .mockRejectedValueOnce(Object.assign(new Error("deadline expired"), { status: 504 }))
      .mockResolvedValueOnce({ text: "Open weekdays.", stopReason: "end", toolCalls: [] });

    const result = await runGeminiDemo({
      apiKey: "test-key",
      question: "What are the clinic hours?",
    });

    expect(result.reply).toBe("Open weekdays.");
    expect(modelCall).toHaveBeenCalledTimes(2);
  });

  it("retries once when the SDK request times out", async () => {
    env.NODE_ENV = "development";
    modelCall
      .mockRejectedValueOnce(Object.assign(new Error("timed out"), { name: "APIConnectionTimeoutError" }))
      .mockResolvedValueOnce({ text: "Open weekdays.", stopReason: "end", toolCalls: [] });

    const result = await runGeminiDemo({
      apiKey: "test-key",
      question: "What are the clinic hours?",
    });

    expect(result.reply).toBe("Open weekdays.");
    expect(modelCall).toHaveBeenCalledTimes(2);
  });
});
