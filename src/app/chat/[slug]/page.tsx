import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DrPillAvatar } from "@/components/brand/dr-pill-avatar";
import { ASSISTANT_NAME } from "@/config/brand";
import { ChatWindow } from "@/features/assistant/components/chat-window";
import {
  chatConfigured,
  getClinicBySlug,
  isClinicOpenNow,
} from "@/features/assistant/chat-service";
import { serverEnv } from "@/lib/env-server";
import { createServiceClient } from "@/lib/supabase/service";

export const metadata: Metadata = { title: "Chat" };
export const dynamic = "force-dynamic";

function Unavailable() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
      <DrPillAvatar mood="sleepy" size={96} decorative />
      <h1 className="text-card-title">{ASSISTANT_NAME} is not available yet</h1>
      <p className="text-muted">Please contact the clinic directly.</p>
    </main>
  );
}

/** Public page: no login. Shows only the clinic's name. */
export default async function PublicChatPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!serverEnv().SUPABASE_SERVICE_ROLE_KEY) return <Unavailable />;
  const svc = createServiceClient();
  const clinic = await getClinicBySlug(svc, slug);
  if (!clinic) notFound();
  // Live AI is off by default: the page says so and never loads clinic hours or any clinic data.
  if (!chatConfigured().ok) return <Unavailable />;
  const open = await isClinicOpenNow(svc, clinic);
  return (
    <main className="bg-canvas min-h-screen">
      <ChatWindow slug={slug} clinicName={clinic.name} open={open} />
    </main>
  );
}
