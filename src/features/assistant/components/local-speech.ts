const PREFERRED_LANGUAGE_PREFIXES = ["fil", "tl-ph", "en-ph", "en"] as const;

/** Returns a preferred locally installed voice only; remote browser voices are excluded. */
export function findLocalSpeechVoice(
  voices: readonly SpeechSynthesisVoice[],
): SpeechSynthesisVoice | null {
  const localVoices = voices.filter((voice) => voice.localService);
  if (localVoices.length === 0) return null;

  for (const prefix of PREFERRED_LANGUAGE_PREFIXES) {
    const preferred = localVoices.find((voice) => voice.lang.toLowerCase().startsWith(prefix));
    if (preferred) return preferred;
  }

  return localVoices[0] ?? null;
}
