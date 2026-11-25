import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getWorkspaceMock, runGeminiDemoMock } = vi.hoisted(() => ({
  getWorkspaceMock: vi.fn(),
  runGeminiDemoMock: vi.fn(),
}));

vi.mock("@/features/auth/workspace", () => ({ getWorkspace: getWorkspaceMock }));
vi.mock("./run", () => ({
  runGeminiDemo: runGeminiDemoMock,
  SYNTHETIC_QUESTIONS: ["What are the clinic hours?", "Where is the clinic located?", "Which doctors work at the clinic?"],
}));

import { runSyntheticDemoAction, synthesizeDemoVoiceAction } from "./actions";

function formWithLine(lineId: string) {
  const formData = new FormData();
  formData.set("lineId", lineId);
  return formData;
}

function formWithQuestion(question: string) {
  const formData = new FormData();
  formData.set("question", question);
  return formData;
}

const oldNodeEnv = process.env.NODE_ENV;
const oldGeminiApiKey = process.env.GEMINI_API_KEY;
const env = process.env as Record<string, string | undefined>;

beforeEach(() => {
  getWorkspaceMock.mockResolvedValue({
    user: { id: "user-1", email: "owner@example.test", fullName: "Owner" },
    membership: { id: "membership-1", role: "owner", clinic: {} },
  });
});

afterEach(() => {
  vi.clearAllMocks();
  if (oldNodeEnv === undefined) delete env.NODE_ENV;
  else env.NODE_ENV = oldNodeEnv;
  if (oldGeminiApiKey === undefined) delete env.GEMINI_API_KEY;
  else env.GEMINI_API_KEY = oldGeminiApiKey;
});

describe("synthesizeDemoVoiceAction", () => {
  it("rejects client-supplied speech text instead of forwarding it to Gemini", async () => {
    env.NODE_ENV = "development";

    const result = await synthesizeDemoVoiceAction({}, formWithLine("Patient Maria has an appointment"));

    expect(result.message).toBe("Please check the highlighted fields.");
    expect(result.data).toBeUndefined();
  });

  it("refuses voice generation outside local development", async () => {
    env.NODE_ENV = "production";

    const result = await synthesizeDemoVoiceAction({}, formWithLine("schedule"));

    expect(result.message).toMatch(/only in local development/i);
    expect(result.data).toBeUndefined();
  });

  it("requires staff-management permission", async () => {
    env.NODE_ENV = "development";
    getWorkspaceMock.mockResolvedValueOnce({
      user: { id: "user-2", email: "doctor@example.test", fullName: "Doctor" },
      membership: { id: "membership-2", role: "doctor", clinic: {} },
    });

    const result = await synthesizeDemoVoiceAction({}, formWithLine("schedule"));

    expect(result.message).toMatch(/permission/i);
    expect(result.data).toBeUndefined();
  });
});

describe("runSyntheticDemoAction", () => {
  it("explains Gemini's temporary high-demand response after retries fail", async () => {
    env.NODE_ENV = "development";
    env.GEMINI_API_KEY = "test-key";
    runGeminiDemoMock.mockRejectedValueOnce(Object.assign(new Error("temporary"), { status: 503 }));

    const result = await runSyntheticDemoAction({}, formWithQuestion("What are the clinic hours?"));

    expect(result.message).toMatch(/temporarily experiencing high demand/i);
    expect(result.message).not.toMatch(/could not answer right now/i);
  });

  it("returns a bounded-timeout message when Gemini does not respond", async () => {
    env.NODE_ENV = "development";
    env.GEMINI_API_KEY = "test-key";
    runGeminiDemoMock.mockRejectedValueOnce(Object.assign(new Error("deadline expired"), { status: 504 }));

    const result = await runSyntheticDemoAction({}, formWithQuestion("What are the clinic hours?"));

    expect(result.message).toMatch(/took too long to respond/i);
  });

  it("recognizes the SDK connection-timeout error by its name", async () => {
    env.NODE_ENV = "development";
    env.GEMINI_API_KEY = "test-key";
    runGeminiDemoMock.mockRejectedValueOnce(Object.assign(new Error("request timed out"), { name: "APIConnectionTimeoutError" }));

    const result = await runSyntheticDemoAction({}, formWithQuestion("What are the clinic hours?"));

    expect(result.message).toMatch(/took too long to respond/i);
  });

  it("explains when the Gemini Free Tier request quota has been reached", async () => {
    env.NODE_ENV = "development";
    env.GEMINI_API_KEY = "test-key";
    runGeminiDemoMock.mockRejectedValueOnce(Object.assign(new Error("free tier quota reached"), { status: 429 }));

    const result = await runSyntheticDemoAction({}, formWithQuestion("What are the clinic hours?"));

    expect(result.message).toMatch(/free tier request limit has been reached/i);
  });
});
