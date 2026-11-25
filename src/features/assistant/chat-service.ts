import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { assistantSettingsSchema } from "@/features/assistant/settings";
import { detectEmergency, EMERGENCY_REPLY } from "./agent/emergency";
import { FALLBACK_REPLY, runAgent, type HistoryMessage, type ModelCall } from "./agent/run";
import type { AgentStore, ClinicInfo } from "./agent/store";
import { createSupabaseAgentStore } from "./agent/store-supabase";
import { minutesOfDay, toMinutes, todayIn, weekdayOf } from "@/lib/datetime";
import { serverEnv } from "@/lib/env-server";
import { createGeminiModelCall } from "./agent/gemini";

export const MAX_MESSAGE_CHARS = 1000;
export const MAX_PATIENT_MESSAGES_PER_CONVERSATION = 60;
export const DEFAULT_MODEL = "gemini-3.8-flash";
export const BUSY_REPLY =
  "Maraming salamat po sa pasensya. Marami kaming mensahe ngayon, kaya ipinasa ko na ito sa staff namin para masagot kayo nang maayos.";

export const chatSlugSchema = z.string().regex(/^[a-z0-9]{8,32}$/);

/* ------------------------------- tokens ---------------------------------- */

export { hashToken, newToken, tokenMatches } from "@/lib/token";
import { hashToken as _hash, newToken as _new, tokenMatches } from "@/lib/token";

/** Trim, drop control characters, cap length. Returns null for empty input. */
export function cleanMessage(input: string): string | null {
  const s = input.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim();
  return s ? s.slice(0, MAX_MESSAGE_CHARS) : null;
}

/* ------------------------------- model ----------------------------------- */

/**
 * Live AI (patient chat and owner questions) is paused: Gemini Free must not receive live clinic
 * or patient data (CLAUDE.md). It stays off unless LIVE_AI_ENABLED=true is set on purpose.
 */
export function liveAiEnabled(): boolean {
  return serverEnv().LIVE_AI_ENABLED === true;
}

export function chatConfigured(): { ok: true; model: string } | { ok: false; missing: string } {
  const env = serverEnv();
  if (!liveAiEnabled()) return { ok: false, missing: "LIVE_AI_ENABLED" };
  return env.GEMINI_API_KEY
    ? { ok: true, model: env.GEMINI_MODEL ?? DEFAULT_MODEL }
    : { ok: false, missing: "GEMINI_API_KEY" };
}

export function createModelCall(): ModelCall | null {
  if (!liveAiEnabled()) return null;
  const apiKey = serverEnv().GEMINI_API_KEY;
  return apiKey ? createGeminiModelCall({ apiKey }) : null;
}

/* ------------------------------ data access ------------------------------ */

const clinicRow = z.object({
  id: z.string(),
  name: z.string(),
  timezone: z.string(),
  address: z.string().nullable(),
  phone: z.string().nullable(),
  assistant_settings: assistantSettingsSchema,
});

export async function getClinicBySlug(
  svc: SupabaseClient,
  slug: string,
): Promise<ClinicInfo | null> {
  if (!chatSlugSchema.safeParse(slug).success) return null;
  const { data } = await svc
    .from("clinics")
    .select("id, name, timezone, address, phone, assistant_settings")
    .eq("chat_slug", slug)
    .maybeSingle();
  const r = clinicRow.nullable().safeParse(data ?? null);
  if (!r.success || !r.data) return null;
  return {
    id: r.data.id,
    name: r.data.name,
    timezone: r.data.timezone,
    address: r.data.address,
    phone: r.data.phone,
    settings: r.data.assistant_settings,
  };
}

/** Is any branch open right now? Used for Dr. Pill's "sleepy" mood after hours. */
export async function isClinicOpenNow(
  svc: SupabaseClient,
  clinic: ClinicInfo,
  now: Date = new Date(),
): Promise<boolean> {
  const { data } = await svc
    .from("clinic_hours")
    .select("weekday, opens_at, closes_at")
    .eq("clinic_id", clinic.id);
  const rows = z
    .array(z.object({ weekday: z.number(), opens_at: z.string(), closes_at: z.string() }))
    .parse(data ?? []);
  const wd = weekdayOf(todayIn(clinic.timezone, now));
  const mins = minutesOfDay(now.toISOString(), clinic.timezone);
  return rows.some(
    (r) => r.weekday === wd && mins >= toMinutes(r.opens_at) && mins < toMinutes(r.closes_at),
  );
}

export async function createConversation(
  svc: SupabaseClient,
  clinicId: string,
): Promise<{ id: string; token: string }> {
  const token = _new();
  const { data, error } = await svc
    .from("conversations")
    .insert({ clinic_id: clinicId, channel: "web", token_hash: _hash(token) })
    .select("id")
    .single();
  if (error || !data) throw new Error("could not start conversation");
  return { id: String((data as { id: unknown }).id), token };
}

const convRow = z.object({
  id: z.string(),
  status: z.enum(["open", "needs_human", "resolved"]),
  handled_by: z.enum(["ai", "human"]),
  token_hash: z.string(),
});

/** Returns the conversation only when the token proves the caller started it. */
export async function authenticateConversation(
  svc: SupabaseClient,
  clinicId: string,
  conversationId: string,
  token: string,
) {
  const { data } = await svc
    .from("conversations")
    .select("id, status, handled_by, token_hash")
    .eq("id", conversationId)
    .eq("clinic_id", clinicId)
    .maybeSingle();
  const r = convRow.nullable().safeParse(data ?? null);
  if (!r.success || !r.data || !tokenMatches(token, r.data.token_hash)) return null;
  return { id: r.data.id, status: r.data.status, handledBy: r.data.handled_by };
}

export async function addMessage(
  svc: SupabaseClient,
  m: {
    clinicId: string;
    conversationId: string;
    role: "patient" | "assistant" | "system";
    handledBy: "ai" | "human" | null;
    content: string;
  },
) {
  const { error } = await svc.from("messages").insert({
    clinic_id: m.clinicId,
    conversation_id: m.conversationId,
    role: m.role,
    handled_by: m.handledBy,
    content: m.content,
  });
  if (error) throw new Error("could not save message");
}

const msgRow = z.object({
  role: z.enum(["patient", "assistant", "staff", "system"]),
  content: z.string(),
  created_at: z.string(),
});
export type ChatMessage = z.infer<typeof msgRow>;

export async function loadMessages(
  svc: SupabaseClient,
  conversationId: string,
  opts: { after?: string; limit?: number } = {},
): Promise<ChatMessage[]> {
  let q = svc
    .from("messages")
    .select("id, role, content, created_at")
    .eq("conversation_id", conversationId)
    .neq("role", "system")
    .order("created_at", { ascending: true })
    .limit(opts.limit ?? 60);
  if (opts.after) q = q.gt("created_at", opts.after);
  const { data } = await q;
  return z.array(msgRow).parse(data ?? []);
}

/* ------------------------------- the turn --------------------------------- */

export type TurnResult = { reply: string | null; status: "ai" | "human"; handedOff: boolean };

/** What one turn needs from the outside world. The Supabase version is below; tests use a fake. */
export interface TurnDeps {
  store: AgentStore;
  addMessage(role: "patient" | "assistant", handledBy: "ai" | null, content: string): Promise<void>;
  reopenResolved(): Promise<void>;
  history(): Promise<HistoryMessage[]>;
}

/**
 * One patient message. Order of safeguards: save the message, respect a human takeover, run the
 * deterministic emergency check, apply the clinic's daily reply cap, and only then call the model.
 */
export async function handleTurn(args: {
  deps: TurnDeps;
  conversation: { status: "open" | "needs_human" | "resolved"; handledBy: "ai" | "human" };
  text: string;
  call: ModelCall;
  model: string;
  now?: Date;
}): Promise<TurnResult> {
  const { deps, conversation, text, call, model } = args;
  const { store } = deps;
  const now = args.now ?? new Date();

  await deps.addMessage("patient", null, text);

  // A human owns this conversation: just queue the message for them.
  if (conversation.handledBy === "human" && conversation.status !== "resolved")
    return { reply: null, status: "human", handedOff: true };
  // A resolved conversation that gets a new message returns to Dr. Pill.
  if (conversation.status === "resolved") await deps.reopenResolved();

  if (detectEmergency(text)) {
    await store.handoff(
      "medical",
      "The patient's message may describe an emergency. Please check right away.",
    );
    await store.record({
      kind: "handoff",
      status: "executed",
      autonomy: "auto",
      payload: { reason: "medical", emergency: true },
      outcome: "emergency guidance sent",
    });
    await deps.addMessage("assistant", "ai", EMERGENCY_REPLY);
    return { reply: EMERGENCY_REPLY, status: "human", handedOff: true };
  }

  const rule = await store.rule("reply");
  if ((await store.actionsToday("reply")) >= rule.dailyLimit) {
    await store.handoff("other", "Dr. Pill reached today's reply limit for this clinic.");
    await deps.addMessage("assistant", "ai", BUSY_REPLY);
    return { reply: BUSY_REPLY, status: "human", handedOff: true };
  }

  let reply = FALLBACK_REPLY;
  let handedOff = false;
  try {
    const result = await runAgent({ store, call, model, history: await deps.history(), now });
    reply = result.reply;
    handedOff = result.handedOff;
    await store.record({
      kind: "reply",
      status: "executed",
      autonomy: "auto",
      payload: { steps: result.steps },
    });
  } catch (e) {
    console.error("assistant turn failed", {
      conversation: store.conversationId,
      name: e instanceof Error ? e.name : "error",
    });
    await store.record({
      kind: "reply",
      status: "failed",
      autonomy: "auto",
      payload: {},
      outcome: "model error",
    });
    await store.handoff("other", "Dr. Pill had a technical problem. Please reply to the patient.");
    handedOff = true;
  }
  await deps.addMessage("assistant", "ai", reply);
  return { reply, status: handedOff ? "human" : "ai", handedOff };
}

/** Production wiring: everything goes through the service-role client, scoped to one clinic and conversation. */
export async function handlePatientMessage(args: {
  svc: SupabaseClient;
  clinic: ClinicInfo;
  conversation: {
    id: string;
    status: "open" | "needs_human" | "resolved";
    handledBy: "ai" | "human";
  };
  text: string;
  call: ModelCall;
  model: string;
  now?: Date;
}): Promise<TurnResult> {
  const { svc, clinic, conversation } = args;
  const base = { clinicId: clinic.id, conversationId: conversation.id };
  const deps: TurnDeps = {
    store: createSupabaseAgentStore(svc, clinic, conversation.id),
    addMessage: (role, handledBy, content) =>
      addMessage(svc, { ...base, role, handledBy, content }),
    reopenResolved: async () => {
      await svc
        .from("conversations")
        .update({ status: "open", handled_by: "ai" })
        .eq("id", conversation.id)
        .eq("clinic_id", clinic.id);
    },
    history: async () => {
      const all = await loadMessages(svc, conversation.id, { limit: 30 });
      return all
        .filter((m) => m.role === "patient" || m.role === "assistant")
        .map((m): HistoryMessage => ({
          role: m.role === "patient" ? "user" : "assistant",
          content: m.content,
        }));
    },
  };
  return handleTurn({
    deps,
    conversation,
    text: args.text,
    call: args.call,
    model: args.model,
    now: args.now,
  });
}
