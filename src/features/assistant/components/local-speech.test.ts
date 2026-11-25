import { describe, expect, it } from "vitest";
import { findLocalSpeechVoice } from "./local-speech";

function voice(lang: string, localService: boolean): SpeechSynthesisVoice {
  return { lang, localService } as SpeechSynthesisVoice;
}

describe("findLocalSpeechVoice", () => {
  it("prefers a local Filipino voice when available", () => {
    const english = voice("en-US", true);
    const filipino = voice("fil-PH", true);

    expect(findLocalSpeechVoice([english, filipino])).toBe(filipino);
  });

  it("never selects a remote voice", () => {
    expect(findLocalSpeechVoice([voice("en-US", false)])).toBeNull();
  });

  it("uses the first local voice when preferred languages are unavailable", () => {
    const first = voice("ja-JP", true);
    const second = voice("fr-FR", true);

    expect(findLocalSpeechVoice([first, second])).toBe(first);
  });
});
