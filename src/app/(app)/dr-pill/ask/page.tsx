import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { DrPillSkillsLab } from "@/features/assistant/demo/skills-lab";
import { DrPillTabs } from "@/features/assistant/components/dr-pill-tabs";
import { requireCapability } from "@/features/auth/workspace";
import { serverEnv } from "@/lib/env-server";

export const metadata: Metadata = { title: "Ask Dr. Pill" };

export default async function AskPage() {
  await requireCapability("staff.manage");
  const demoAvailable = process.env.NODE_ENV === "development" && Boolean(serverEnv().GEMINI_API_KEY);
  return (
    <>
      <PageHeader eyebrow="Assistant" title="Dr. Pill" />
      <DrPillTabs active="ask" isOwner />
      <DrPillSkillsLab demoAvailable={demoAvailable} />
    </>
  );
}
