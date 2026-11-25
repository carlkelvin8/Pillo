# Gemini for Local Agent Demos

## Intent

Use Gemini's free tier to evaluate the agent experience before committing to paid AI usage. Keep real clinic and patient information out of free-tier requests so Pillo can continue onboarding clinics and validating its core workflows safely.

## Goals

- Replace the Anthropic-specific model boundary with a provider-neutral call contract and a Gemini adapter.
- Support a local/development agent demo that uses synthetic clinic fixtures only.
- Keep API credentials server-side and optional; with no Gemini key, AI remains off and the rest of the app works.
- Exercise the existing tool loops and handoff behavior with tests and synthetic inputs.

## Non-goals

- Do not send public patient chat, stored conversation history, clinic settings, or owner metrics to Gemini Free tier.
- Do not enable AI in production or change database schema/migrations.
- Do not change onboarding, scheduling, billing, or other non-AI product features.
- Do not create or store a Gemini API key as part of code changes.

## Approaches considered

1. Switch both live app flows directly to Gemini Free. This is the smallest provider change, but it would send user messages and clinic data to the provider under free-tier terms, so it does not fit the privacy boundary.
2. Add a provider-neutral interface and Gemini adapter, and expose it only through a local synthetic-data demo. This lets us test the agent with no paid API while keeping live clinic data out of Gemini. **Selected.**
3. Leave the model integration mocked until market validation. This avoids provider work but does not let us evaluate Gemini's actual responses.

## Design

The assistant's shared agent and command-center loops will use Pillo-owned message, tool-call, tool-result, and response types. A Gemini adapter will translate those types to and from the Gemini API. Tool execution, consent checks, booking safeguards, and owner-only metric permissions remain in the existing application code.

The live patient chat and owner command-center routes will not use Gemini Free. A local-only demo path will call the Gemini adapter with hard-coded synthetic clinic data and scripted questions, without Supabase reads or writes. The server must reject the demo path outside local development. `GEMINI_API_KEY` and `GEMINI_MODEL` remain optional, server-only settings.

## Verification

- Unit tests cover request/response conversion, tool-call continuation, and local-only/demo-data boundaries.
- A manual Gemini smoke test may be run with synthetic input once a key is configured.
- Existing test, lint, typecheck, and build commands must pass before completion.

## Open implementation calls

- Choose the supported Gemini SDK/model based on current official docs at implementation time.
- Keep the local demo minimal; no clinic-facing controls or production feature flags are added.
