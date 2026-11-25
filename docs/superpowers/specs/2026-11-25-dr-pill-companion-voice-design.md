# Dr. Pill companion and voice design

**Status:** Approved, implemented, and verified on 2026-11-25.

## Intent

Make Dr. Pill feel like a friendly, interactive clinic companion across the staff app, and make the `/dr-pill/ask` experience easier to use. Remove emoji styling and give the mascot clear expressive reactions. Provide voice playback without adding subscription cost or sending patient content to Gemini.

## Approaches considered

1. **Browser-only voice everywhere.** Free and avoids Pillo server-side voice requests, but system voices vary by device and may keep the robotic sound that prompted this work.
2. **Free-first split (recommended).** Gemini TTS speaks only fixed fictional/demo responses in local development. Patient chat uses an explicitly requested, browser-local speech voice when `SpeechSynthesisVoice.localService` is true; if no local voice exists, keep the response readable and do not call a remote voice provider. This gives the demo a more expressive voice while keeping patient voice playback off Gemini and avoiding paid services.
3. **One premium provider for both.** Could create a more consistent voice, but costs money and sends patient audio/text to an outside voice provider. Deferred because the user asked to keep it free.

Google's current Gemini pricing page lists its Flash TTS model on the free tier and marks free-tier content as used to improve Google's products. Therefore the demo voice can only synthesize fixed fictional content, never free-form clinic or patient data. Source: https://ai.google.dev/gemini-api/docs/pricing

## Goals

- Keep a small Dr. Pill pet available on every authenticated clinic page. Clicking it opens or closes a compact companion panel; it must not block primary page actions.
- The global pet opens a small static help panel with role-appropriate links to clinic areas and an “Ask Dr. Pill” link for users allowed to access that page. It does not start a second AI chat or read clinic records.
- Give the pet clear non-emoji states: idle, listening, thinking, speaking, happy, needs-human, and error. Use the existing mascot visual system, add subtle glow/motion, and honor reduced-motion preferences.
- Simplify `/dr-pill/ask`: make the chat the main element, show at most three starter prompts, and move specialty packs, workflow cards, and the synthetic Gemini FAQ behind a compact “Explore skills” area.
- Remove decorative emoji from the Ask page and skill-pack controls. Use the existing icon library and design tokens.
- Keep Gemini fixed-prompt and synthetic-only. Do not send clinic or patient data to Gemini.
- Add a one-tap “Read aloud” control to assistant replies in the patient chat. Use local browser voices only; never autoplay, record, or upload patient audio for this free MVP.
- Preserve text chat when voice is unavailable. Do not claim that all devices use the same voice.

## Non-goals

- No paid voice API, provider subscription, voice cloning, phone calling, or provider account setup.
- No microphone transcription or patient voice-note upload in the patient chat in this free MVP. Browser speech recognition may process audio through a browser vendor, so it needs a separate data-flow decision.
- No changes to the patient-chat model, booking skills, clinic data tools, or Dr. Pill's authority.
- No emoji-based faces or reactions.

## Interaction sketch

- Clinic pages: a small glowing Dr. Pill avatar sits at the lower corner. Click opens a compact help panel with short fixed help topics, role-appropriate navigation links, and (when authorized) a link to Ask Dr. Pill. The avatar changes expression for idle, happy, and attention states.
- Ask Dr. Pill: a clean conversation panel with three prompt chips and a single composer. A collapsed “Explore skills” area contains the specialty packs, workflow previews, and synthetic FAQ.
- Patient chat: every assistant bubble can be read aloud by tapping a speaker control. Speech uses only a browser voice marked local. The text remains available at all times.

## Privacy and safety constraints

- The Gemini request is limited to the existing fixed synthetic FAQ prompts and fixed fictional skill replies. Do not synthesize user-entered content with Gemini.
- The patient chat's read-aloud feature passes its reply only to the local browser speech engine selected as local; it does not call an application server route or Gemini.
- No audio blobs, voice transcripts, or patient content are stored by the new voice controls.
- The UI clearly labels the staff-side Gemini feature as a local synthetic demo.
- The help panel uses fixed copy and authorized navigation links only; it has no free-text input, AI request, or clinic-data query.

## Acceptance criteria

- The pet is present on every authenticated clinic page, with a compact open/close state and accessible controls.
- Ask Dr. Pill shows the chat first; skill exploration is secondary; no decorative emoji remain in that flow.
- Mascot reactions visibly change for idle/listening/thinking/speaking/handoff/error states and are suppressed or simplified for reduced motion.
- Demo TTS uses only fixed fictional replies and is available only in local development.
- Patient reply playback is opt-in per reply and uses a browser-local voice only; absence of one produces a text-only fallback.
- Unit tests cover voice selection, synthetic-only TTS restrictions, and response states. Browser QA checks the global pet, simplified Ask UI, and read-aloud fallback.
- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:db`, and `pnpm build` pass.
