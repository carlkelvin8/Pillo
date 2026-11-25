# Dr. Pill Companion and Voice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a role-aware Dr. Pill help companion throughout authenticated clinic pages, simplify the Ask Dr. Pill demo, and provide opt-in local speech playback in patient chat.

**Architecture:** Keep the global companion as a small client component mounted in `AppShell`, with role-filtered links and no data fetching. Keep the synthetic skills lab self-contained and make exploration secondary to the demo conversation. For staff demo speech, a server action accepts only a fixed synthetic line ID and uses Gemini TTS in local development; browser speech is the free fallback. Patient chat uses a small browser speech utility that selects only local voices, only after explicit per-message activation.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, Tailwind v4 tokens, lucide-react, Vitest, Testing Library, browser SpeechSynthesis.

**Spec:** `docs/superpowers/specs/2026-11-25-dr-pill-companion-voice-design.md`

## Global Constraints

- Use `APP_NAME` / `ASSISTANT_NAME` from `src/config/brand.ts` for brand names.
- No emoji decoration in the Ask Dr. Pill experience; use lucide-react and design tokens.
- The global companion uses static copy and role-authorized links only; no free-text input, clinic reads, or AI requests.
- Gemini remains local-development-only and fixed synthetic prompts only; patient content never goes to Gemini or another voice API.
- Patient speech is opt-in per reply and selects only a browser voice with `localService === true`; preserve readable text when unavailable.
- Gemini TTS accepts only a finite ID for a hard-coded fictional skills-lab response, is available only in local development, and never accepts arbitrary client text.
- Never autoplay, record, upload, or persist voice content in patient chat.
- Honor the global reduced-motion handling and accessible button/link semantics.

## Review Focus

- No local browser speech voice exists: patient reply remains readable and the control reports unavailability.
- Browser reports only remote voices: do not pass reply text to them.
- Public patient chat must not render the authenticated global companion.
- Roles without `staff.manage` must not get an Ask Dr. Pill link in the global helper.
- Repeated activation or navigating away must stop active speech and avoid stale playback state.

---

### Task 1: Global Dr. Pill help companion

**Files:**
- Create: `src/features/shell/dr-pill-companion.tsx`
- Test: `src/features/shell/dr-pill-companion.test.tsx`
- Modify: `src/features/shell/app-shell.tsx`

**Interfaces:**
- Consumes: `Role`, `navForRole(role)`, `can(role, "staff.manage")`, `DrPillAvatar`.
- Produces: `<DrPillCompanion role={role} />`, mounted once by `AppShell`.

- [x] Write tests that the button opens/closes the help panel, role-filtered links appear, and Ask Dr. Pill is hidden without `staff.manage`.
- [x] Run the focused test; it failed first because the component did not exist.
- [x] Implement a compact fixed help panel with accessible toggle, short fixed help copy, role-visible links from `navForRole`, and a permission-gated Ask Dr. Pill link.
- [x] Run the focused test and confirm it passes.
- [x] Add a visible floating avatar style with a soft idle glow and vertical bob; global reduced-motion rules stop the animation.

### Task 2: Simplify Ask Dr. Pill demo

**Files:**
- Modify: `src/features/assistant/demo/skills-lab.tsx`
- Create: `src/features/assistant/demo/skills-lab.test.tsx`
- Create: `src/features/assistant/demo/voice-lines.ts`
- Create: `src/features/assistant/demo/voice-lines.test.ts`
- Create: `src/features/assistant/demo/actions.test.ts`
- Modify: `src/features/assistant/demo/actions.ts`

**Interfaces:**
- Consumes: existing fixed `PACKS`, `SKILLS`, `RESPONSES`, `SyntheticDemoForm`.
- Produces: primary conversation view with at most three prompt starters and collapsed `Explore skills` section containing packs, workflow previews, and the fixed Gemini FAQ; fixed `VoiceLineId` map; and a local-only Gemini TTS server action that accepts only a `VoiceLineId`.

- [x] Write tests for visible primary chat, no more than three prompt starters, collapsed exploration by default, and no emoji icons in the skill-pack UI.
- [x] Run the focused test; it failed first for the old layout and emoji content.
- [x] Refactor the page so the conversation/composer is primary and a single collapsed exploration panel contains packs, skill cards, and fixed synthetic FAQ; remove redundant floating second chat, microphone/voice-note controls, and emoji presentation.
- [x] Add tests proving arbitrary text cannot be converted to speech, the TTS action is dev-only and permission-gated, and each `VoiceLineId` maps only to a fixed fictional response.
- [x] Add a server action that checks local-development mode, validates a fixed line ID, requires owner permission, invokes Gemini TTS with a cheerful voice style, and returns generated WAV data; use `GEMINI_API_KEY` only server-side.
- [x] Keep demo voice opt-in; use browser speech as a free fallback when Gemini is unavailable, without sending dynamic user-entered message text to any remote provider.
- [x] Run focused tests and confirm they pass.

### Task 3: Local-only patient reply playback

**Files:**
- Create: `src/features/assistant/components/local-speech.ts`
- Create: `src/features/assistant/components/local-speech.test.ts`
- Modify: `src/features/assistant/components/chat-window.tsx`

**Interfaces:**
- Produces: `findLocalSpeechVoice(voices: readonly SpeechSynthesisVoice[]): SpeechSynthesisVoice | null` and a browser-only playback helper used on button activation.
- Playback must refuse remote voices and return an unavailable state when local speech is unsupported.

- [x] Write unit tests for selecting a local voice, returning null when only remote voices are available, and selecting a preferred Filipino/English local voice deterministically.
- [x] Run the focused unit test; it failed first because the helper was missing.
- [x] Implement the tested selection helper and an accessible per-assistant-message Read aloud/Stop control in `ChatWindow`; cancel playback during cleanup and preserve text without local speech support.
- [x] Run focused tests and confirm they pass.

### Task 4: Verification and browser QA

**Files:**
- No additional production files expected.

- [x] Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:db`, and `pnpm build`; all pass (`pnpm test`: 45 files/249 tests; `pnpm test:db`: 6 files/118 tests).
- [x] Verify the authenticated shell renders the help companion and the Ask page has a chat-first hierarchy without emoji in Chrome; verify patient read-aloud text-only fallback with unit tests when no local voice is available.
- [x] Review the final diff; no secrets, migrations, or `docs/design/` files changed.
