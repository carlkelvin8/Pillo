import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { DrPillAvatar } from "@/components/brand/dr-pill-avatar";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { DrPillTabs } from "@/features/assistant/components/dr-pill-tabs";
import { requireCapability } from "@/features/auth/workspace";

export const metadata: Metadata = { title: "Ask Dr. Pill" };

export default async function AskPage() {
  await requireCapability("staff.manage");
  return (
    <>
      <PageHeader eyebrow="Assistant" title="Dr. Pill" />
      <DrPillTabs active="ask" isOwner />
      <Card className="flex flex-col items-start gap-5 sm:flex-row sm:items-center">
        <DrPillAvatar mood="sleepy" size={80} decorative />
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <CardTitle>Clinic questions aren’t available yet</CardTitle>
          <p className="text-muted text-sm">
            Dr. Pill can answer business questions when live clinic AI is enabled. Until then, your
            dashboard and reports remain available for checking clinic activity.
          </p>
          <Button asChild variant="ghost" className="mt-2 w-fit">
            <Link href="/settings/dr-pill">Review Dr. Pill settings</Link>
          </Button>
        </div>
      </Card>
    </>
  );
}
