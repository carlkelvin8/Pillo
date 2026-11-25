import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChatWindow } from "./chat-window";

function installSpeech(voices: SpeechSynthesisVoice[]) {
  const speech = {
    cancel: vi.fn(),
    getVoices: vi.fn(() => voices),
    speak: vi.fn(),
  } as unknown as SpeechSynthesis;
  Object.defineProperty(window, "speechSynthesis", { configurable: true, value: speech });
  class UtteranceMock {
    voice: SpeechSynthesisVoice | null = null;
    onend: (() => void) | null = null;
    onerror: (() => void) | null = null;
    constructor(public text: string) {}
  }
  Object.defineProperty(window, "SpeechSynthesisUtterance", { configurable: true, value: UtteranceMock });
  Object.defineProperty(globalThis, "SpeechSynthesisUtterance", { configurable: true, value: UtteranceMock });
  return speech;
}

afterEach(() => {
  sessionStorage.clear();
});

beforeEach(() => {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: () => ({ matches: false, addListener: vi.fn(), removeListener: vi.fn() }),
  });
  HTMLElement.prototype.scrollIntoView = vi.fn();
});

describe("ChatWindow read aloud", () => {
  it("reads an assistant reply with a local voice after explicit activation", () => {
    const localVoice = { lang: "fil-PH", localService: true } as SpeechSynthesisVoice;
    const speech = installSpeech([localVoice]);
    render(<ChatWindow slug="demo" clinicName="Demo Clinic" open />);

    fireEvent.click(screen.getByRole("button", { name: "Read message aloud" }));

    expect(speech.speak).toHaveBeenCalledOnce();
    expect(speech.cancel).toHaveBeenCalledTimes(1);
    fireEvent.change(screen.getByLabelText("Your message"), { target: { value: "A follow-up" } });
    expect(speech.cancel).toHaveBeenCalledTimes(1);
    const utterance = vi.mocked(speech.speak).mock.calls[0]?.[0] as SpeechSynthesisUtterance;
    expect(utterance.voice).toBe(localVoice);
    expect(screen.getByRole("button", { name: "Stop reading message" })).toBeInTheDocument();
  });

  it("cancels playback when the active reply is stopped", () => {
    const speech = installSpeech([{ lang: "en-US", localService: true } as SpeechSynthesisVoice]);
    render(<ChatWindow slug="demo" clinicName="Demo Clinic" open />);

    fireEvent.click(screen.getByRole("button", { name: "Read message aloud" }));
    fireEvent.click(screen.getByRole("button", { name: "Stop reading message" }));

    expect(speech.cancel).toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Read message aloud" })).toBeInTheDocument();

    const utterance = vi.mocked(speech.speak).mock.calls[0]?.[0] as SpeechSynthesisUtterance;
    act(() => utterance.onerror?.({ error: "canceled" } as SpeechSynthesisErrorEvent));
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("keeps text only when the browser has no local voice", () => {
    const speech = installSpeech([{ lang: "en-US", localService: false } as SpeechSynthesisVoice]);
    render(<ChatWindow slug="demo" clinicName="Demo Clinic" open />);

    fireEvent.click(screen.getByRole("button", { name: "Read message aloud" }));

    expect(speech.speak).not.toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent("No local voice is available");
  });
});
