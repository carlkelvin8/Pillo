import type { Metadata } from "next";
import { PagePlaceholder } from "@/components/layout/page-placeholder";
import { requireCapability } from "@/features/auth/workspace";

export const metadata: Metadata = { title: "Notifications" };

export default async function Page() {
  await requireCapability("staff.manage");
  return (
    <PagePlaceholder
      title="Notifications"
      phase={6}
      description="Reminder and notification preferences arrive with notifications."
    />
  );
}
