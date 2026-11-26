import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { requireCapability } from "@/features/auth/workspace";
import { PlanCards } from "@/features/subscription/plan-cards";

export const metadata: Metadata = { title: "Plan and billing" };

export default async function SubscriptionPage() {
  await requireCapability("staff.manage");
  return (
    <>
      <PageHeader eyebrow="Settings" title="Plan and billing" />
      <PlanCards />
    </>
  );
}
