import { NextResponse } from "next/server";
import { z } from "zod";
import {
  authenticateConversation,
  getClinicBySlug,
  loadMessages,
} from "@/features/assistant/chat-service";
import { rateLimit } from "@/lib/rate-limit";
import { createServiceClient } from "@/lib/supabase/service";
import { serverEnv } from "@/lib/env-server";

export const runtime = "nodejs";

const querySchema = z.object({ conversationId: z.uuid(), after: z.iso.datetime().optional() });

/** Polled by the chat page to pick up replies from staff. The token travels in a header, never the URL. */
export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const headers = { "Cache-Control": "no-store" };
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!rateLimit(`chat-poll:${ip}`, 60, 60_000))
    return NextResponse.json({ error: "Slow down." }, { status: 429, headers });
  if (!serverEnv().SUPABASE_SERVICE_ROLE_KEY)
    return NextResponse.json({ error: "Chat is not available yet." }, { status: 503, headers });

  const url = new URL(request.url);
  const query = querySchema.safeParse({
    conversationId: url.searchParams.get("conversationId"),
    after: url.searchParams.get("after") ?? undefined,
  });
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!query.success || token.length < 20)
    return NextResponse.json({ error: "Invalid request." }, { status: 400, headers });

  const svc = createServiceClient();
  const clinic = await getClinicBySlug(svc, slug);
  if (!clinic) return NextResponse.json({ error: "Not found." }, { status: 404, headers });
  const conversation = await authenticateConversation(
    svc,
    clinic.id,
    query.data.conversationId,
    token,
  );
  if (!conversation) return NextResponse.json({ error: "Expired." }, { status: 401, headers });

  const messages = await loadMessages(svc, conversation.id, { after: query.data.after });
  return NextResponse.json({ status: conversation.handledBy, messages }, { headers });
}
