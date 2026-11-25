import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { DrPillAvatar } from "@/components/brand/dr-pill-avatar";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { DrPillTabs } from "@/features/assistant/components/dr-pill-tabs";
import { requireCapability } from "@/features/auth/workspace";
import { chatConfigured } from "@/features/assistant/chat-service";
import { AskForm } from "@/features/assistant/command/ask-form";

export const metadata: Metadata = { title: "Ask Dr. Pill" };

export default async function AskPage() {
  await requireCapability("staff.manage");
  const config = chatConfigured();
  return (
    <>
      <PageHeader eyebrow="Assistant" title="Dr. Pill" />
      <DrPillTabs active="ask" isOwner />
      {config.ok ? (
        <Card className="flex flex-col gap-5">
          <div>
            <CardTitle>Ask about clinic activity</CardTitle>
            <p className="text-muted mt-1 text-sm">
              Dr. Pill uses your clinic’s figures to answer.
            </p>
          </div>
          <AskForm />
        </Card>
      ) : (
        <Card className="flex flex-col items-start gap-5 sm:flex-row sm:items-center">
          <DrPillAvatar mood="sleepy" size={80} decorative />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <CardTitle>Clinic questions are paused</CardTitle>
            <p className="text-muted text-sm">
              Live AI is switched off while clinic data processing is being reviewed. Your dashboard
              and reports remain available.
            </p>
            <Button asChild variant="ghost" className="mt-2 w-fit">
              <Link href="/settings/dr-pill">Review Dr. Pill settings</Link>
            </Button>
          </div>
        </Card>
      )}
    </>
  );
}
