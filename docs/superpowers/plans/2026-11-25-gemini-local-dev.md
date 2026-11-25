# Gemini Local/Dev Agent Demo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Evaluate Dr. Pill's agent flow with Gemini Free using only synthetic local data, with no Gemini requests from live clinic routes.

**Architecture:** Replace Anthropic-specific loop types with Pillo-owned model request/response types. Add a Gemini `generateContent` adapter for text and function calling, then expose it only through a local synthetic demo runner that has no Supabase imports or database client.

**Tech Stack:** Next.js 15, TypeScript, Zod, `@google/genai`, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-25-gemini-local-dev-design.md`

## Global Constraints

- Gemini Free receives synthetic clinic data only; live patient chat and owner metrics never call it.
- `GEMINI_API_KEY` and `GEMINI_MODEL` are optional, server-only environment variables.
- The local demo refuses to run when `NODE_ENV=production`.
- Existing booking consent, clinic scope, human handoff, and owner-only metric protections stay in the app code.
- Do not create or store an API key in this change.

## Review Focus

- Tool-call arguments arrive as missing or non-object data: verify adapter returns a safe invalid call instead of executing it.
- Model returns text and a tool call together: preserve both in the common response so the existing step loop can execute the tool and return the final answer.
- Multiple tool calls in one response: execute and return every call once, retaining call IDs.
- Malformed or missing `GEMINI_API_KEY`: keep live routes disabled and return a safe local-demo setup message.
- Production invocation of the demo runner: fail before creating the Gemini client or sending a request.

---

### Task 1: Define provider-neutral agent messages and refactor the loops

**Files:**
- Create: `src/features/assistant/agent/model.ts`
- Modify: `src/features/assistant/agent/run.ts`
- Modify: `src/features/assistant/agent/tools.ts`
- Modify: `src/features/assistant/agent/test-utils.ts`
- Modify: `src/features/assistant/command/run.ts`
- Modify: `src/features/assistant/command/metrics.ts`
- Test: `src/features/assistant/agent/agent.test.ts`
- Test: `src/features/assistant/command/command.test.ts`

**Interfaces:**
- `ModelTool`: `{ name: string; description: string; parameters: Record<string, unknown> }`.
- `ModelToolCall`: `{ id: string; name: string; input: unknown }`.
- `ModelToolResult`: `{ callId: string; name: string; content: string; isError: boolean }`.
- `ModelMessage` is a discriminated union of `{ role: "user" | "assistant"; content: string }`, `{ role: "assistant"; content: string; toolCalls: ModelToolCall[] }`, and `{ role: "tool"; toolResults: ModelToolResult[] }`.
- `ModelRequest`: `{ model: string; system: string; tools: ModelTool[]; messages: ModelMessage[] }`.
- `ModelResponse`: `{ text: string; toolCalls: ModelToolCall[]; stopReason: "end" | "tool_use" | "refusal" }`.
- `ModelCall`: `(request: ModelRequest) => Promise<ModelResponse>`.

- [x] **Step 1: Write failing tests for the normalized tool loop**
  - `runs one tool call and continues with its result` asserts the second request contains the matching call ID and tool result, then returns final text.
  - `executes every tool call in the same model response` asserts each result is sent once.
  - `preserves text returned alongside tool calls` asserts mixed text and calls are both present in the next request.
  - `runs owner metrics tools through the same model contract` asserts command flow handles a function call and final text.
- [x] **Step 2: Run the focused tests and confirm they fail because the shared model types/flow are missing.**
- [x] **Step 3: Add shared model types and update public clinic tools, metrics tools, and both loops to consume them.** Keep existing tool execution, rate limits, handoff decisions, clinic scope, and consent checks unchanged.
- [x] **Step 4: Run `pnpm exec vitest run src/features/assistant/agent/agent.test.ts src/features/assistant/command/command.test.ts` and confirm both loops pass.**

### Task 2: Add and test the Gemini API adapter

**Files:**
- Create: `src/features/assistant/agent/gemini.ts`
- Modify: `src/lib/env-server.ts`
- Modify: `package.json` and `pnpm-lock.yaml`
- Test: `src/features/assistant/agent/gemini.test.ts`
- Test: `src/features/assistant/chat-service.test.ts`

**Interfaces:**
- `createGeminiModelCall(options: { apiKey: string; client?: GoogleGenAI }): ModelCall`.
- Default model: `gemini-3.8-flash`; allow `GEMINI_MODEL` override.

- [x] **Step 1: Write failing adapter tests for request conversion, text response, one/multiple function calls, mixed text plus calls, and malformed tool arguments. Add a chat-service test proving `GEMINI_API_KEY` does not enable a live clinic route.** Inject a fake Gemini client; never use a live key in unit tests.
- [x] **Step 2: Run `pnpm exec vitest run src/features/assistant/agent/gemini.test.ts` and confirm each failure is caused by the missing adapter behavior.**
- [x] **Step 3: Add pinned `@google/genai` dependency and implement stateless `models.generateContent` calls using the shared model types; do not enable automatic function execution in Google SDK.** The application executes all tool calls locally after Zod checks.
- [x] **Step 4: Add optional `GEMINI_API_KEY` and `GEMINI_MODEL` to `serverEnv`, preserving safe defaults when absent.**
- [x] **Step 5: Run the focused adapter tests and confirm they pass.**

### Task 3: Add the local synthetic demo and keep clinic routes disabled

**Files:**
- Create: `src/features/assistant/demo/synthetic-store.ts`
- Create: `src/features/assistant/demo/run.ts`
- Create: `scripts/gemini-demo.ts`
- Modify: `src/features/assistant/chat-service.ts`
- Modify: `src/features/assistant/command/actions.ts`
- Modify: `src/features/assistant/command/command.test.ts`
- Modify: `src/features/assistant/agent/agent.test.ts`
- Modify: `src/lib/env-server.ts`
- Modify: `package.json` and `pnpm-lock.yaml`
- Modify: `.env.example`
- Modify: `CLAUDE.md`
- Test: `src/features/assistant/demo/run.test.ts`

**Interfaces:**
- `runGeminiDemo(options: { apiKey: string; model?: string; question: string }): Promise<{ reply: string; steps: number }>`.
- Demo fixture uses a fictional clinic, fictional staff, fixed hours, and synthetic patient-free questions; its store is in-memory and implements `AgentStore` without Supabase.
- The demo rejects `NODE_ENV=production` before constructing a Gemini client.

- [x] **Step 1: Write failing tests that prove the demo returns only synthetic fixture details, performs no database import, and rejects production mode before a model call. Add tests that `/api/chat` and `/dr-pill/ask` remain disabled even when `GEMINI_API_KEY` is set.**
- [x] **Step 2: Run `pnpm exec vitest run src/features/assistant/demo/run.test.ts` and confirm the guard tests fail for the intended reason.**
- [x] **Step 3: Implement the synthetic in-memory `AgentStore`, demo runner, and `pnpm ai:demo` script.** The script loads only `GEMINI_API_KEY` and `GEMINI_MODEL`; the fixture contains no Supabase URL or service key.
- [x] **Step 4: Remove Anthropic runtime wiring and keep `/api/chat` and `/dr-pill/ask` disabled even when a Gemini key exists; return a clear “local synthetic demo only” state for those AI routes. Remove the Anthropic SDK and environment variables from the runtime configuration.**
- [x] **Step 5: Document Gemini free-tier local setup and the synthetic-data-only boundary in `.env.example` and `CLAUDE.md`.**
- [x] **Step 6: Run demo tests and verify the production guard passes.**

### Task 4: Verify the whole repository

**Files:**
- No additional files.

- [x] **Step 1: Run `pnpm test`.**
- [x] **Step 2: Run `pnpm test:db`.**
- [x] **Step 3: Run `pnpm lint && pnpm typecheck`.**
- [x] **Step 4: Run `pnpm build`.**
- [x] **Step 5: If `GEMINI_API_KEY` is available, run `pnpm ai:demo` with its synthetic prompt; never use Supabase-backed or patient data. If no key is configured, report the live provider call as unverified.**

## Execution Notes

- Execute natively in this session; the adapter and two loops share the normalized request/response contract and should be reviewed together.
- Do not commit unless the user asks.
