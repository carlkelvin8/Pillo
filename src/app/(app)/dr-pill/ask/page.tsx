import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardTitle } from "@/components/ui/card";
import { AskForm } from "@/features/assistant/command/ask-form";
import { DrPillTabs } from "@/features/assistant/components/dr-pill-tabs";
import { requireCapability } from "@/features/auth/workspace";

export const metadata: Metadata = { title: "Ask Dr. Pill" };

export default async function AskPage() {
  await requireCapability("staff.manage");
  return (
    <>
      <PageHeader eyebrow="Assistant" title="Dr. Pill" />
      <DrPillTabs active="ask" isOwner />
      <Card className="flex max-w-3xl flex-col gap-5">
        <div>
          <CardTitle>Ask about your clinic</CardTitle>
          <p className="text-muted">
            Revenue, appointments, no-shows, invoices and Chair-Filler. Dr. Pill reads vetted
            numbers only, never patient records.
          </p>
        </div>
        <AskForm />
      </Card>
    </>
  );
}
