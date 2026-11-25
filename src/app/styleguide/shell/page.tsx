import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { AssistantSettingsForm } from "@/features/assistant/assistant-settings-form";
import { assistantSettingsSchema } from "@/features/assistant/settings";
import { saveAssistantSettingsAction } from "@/features/clinic/actions";
import { StepIndicator } from "@/features/onboarding/components/step-indicator";
import { AppShell } from "@/features/shell/app-shell";

export const metadata: Metadata = { title: "App shell" };

/** Static preview of the app shell with sample data. No session needed; nothing here saves. */
export default function ShellPreviewPage() {
  return (
    <AppShell
      user={{ name: "Maria Santos", email: "maria@example.test" }}
      role="owner"
      clinicName="[CLINIC NAME]"
    >
      <PageHeader eyebrow="Preview" title="App shell" />
      <StepIndicator current={3} />
      <AssistantSettingsForm
        action={saveAssistantSettingsAction}
        initial={assistantSettingsSchema.parse({})}
        submitLabel="Continue"
      />
    </AppShell>
  );
}
