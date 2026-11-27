import { NextResponse } from "next/server";
import { z } from "zod";
import {
  addMessage,
  authenticateConversation,
  chatConfigured,
  cleanMessage,
  createConversation,
  createModelCall,
  getClinicBySlug,
  handlePatientMessage,
  MAX_MESSAGE_CHARS,
  MAX_PATIENT_MESSAGES_PER_CONVERSATION,
} from "@/features/assistant/chat-service";
import { rateLimit } from "@/lib/rate-limit";
import { createServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";
export const maxDuration = 60;

const bodySchema = z.object({
  message: z.string().max(MAX_MESSAGE_CHARS * 2),
  conversationId: z.uuid().optional(),
  token: z.string().min(20).max(100).optional(),
});

const json = (body: Record<string, unknown>, status = 200, retryAfterSeconds?: number) =>
  NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      ...(retryAfterSeconds ? { "Retry-After": String(retryAfterSeconds) } : {}),
    },
  });

/** Public endpoint used by the clinic's chat page. Patients are anonymous: a per-conversation token proves ownership. */
export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!rateLimit(`chat:${ip}`, 20, 60_000))
    return json({ error: "Too many messages. Please wait a moment." }, 429, 60);

  const config = chatConfigured();
  if (!config.ok) return json({ error: "Chat is not available yet." }, 503);

  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return json({ error: "Invalid message." }, 400);
  const text = cleanMessage(body.data.message);
  if (!text) return json({ error: "Please type a message." }, 400);

  const svc = createServiceClient();
  const clinic = await getClinicBySlug(svc, slug);
  if (!clinic) return json({ error: "Not found." }, 404);

  let conversation: {
    id: string;
    status: "open" | "needs_human" | "resolved";
    handledBy: "ai" | "human";
  };
  let token: string | undefined;
  if (body.data.conversationId && body.data.token) {
    const found = await authenticateConversation(
      svc,
      clinic.id,
      body.data.conversationId,
      body.data.token,
    );
    if (!found) return json({ error: "This chat has expired. Please start a new one." }, 401);
    conversation = found;
    const { count } = await svc
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("conversation_id", found.id)
      .eq("role", "patient");
    if ((count ?? 0) >= MAX_PATIENT_MESSAGES_PER_CONVERSATION)
      return json({ error: "This chat is full. Please call the clinic or start a new chat." }, 429);
  } else {
    if (!rateLimit(`chat-new:${ip}`, 5, 600_000))
      return json({ error: "Too many new chats. Please try again later." }, 429, 600);
    const created = await createConversation(svc, clinic.id);
    conversation = { id: created.id, status: "open", handledBy: "ai" };
    token = created.token;
  }

  const call = createModelCall();
  if (!call) return json({ error: "Chat is not available yet." }, 503);

  try {
    const turn = await handlePatientMessage({
      svc,
      clinic,
      conversation,
      text,
      call,
      model: config.model,
    });
    return json({
      conversationId: conversation.id,
      ...(token ? { token } : {}),
      reply: turn.reply,
      status: turn.status,
    });
  } catch {
    // Never leak internals. The message may or may not have been saved; the patient can retry.
    await addMessage(svc, {
      clinicId: clinic.id,
      conversationId: conversation.id,
      role: "system",
      handledBy: null,
      content: "Technical problem while handling a message.",
    }).catch(() => undefined);
    return json({ error: "Something went wrong. Please try again." }, 500);
  }
}
