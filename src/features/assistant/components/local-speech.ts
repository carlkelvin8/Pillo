const PREFERRED_LANGUAGE_PREFIXES = ["fil", "tl-ph", "en-ph", "en"] as const;

/** Prefer a local Filipino voice, then fall back to any available browser voice. */
export function findLocalSpeechVoice(
  voices: readonly SpeechSynthesisVoice[],
): SpeechSynthesisVoice | null {
  const localVoices = voices.filter((voice) => voice.localService);

  for (const prefix of PREFERRED_LANGUAGE_PREFIXES) {
    const preferred = localVoices.find((voice) => voice.lang.toLowerCase().startsWith(prefix));
    if (preferred) return preferred;
  }

  for (const prefix of PREFERRED_LANGUAGE_PREFIXES) {
    const preferred = voices.find((voice) => voice.lang.toLowerCase().startsWith(prefix));
    if (preferred) return preferred;
  }

  return localVoices[0] ?? voices[0] ?? null;
}
