import type { Metadata } from "next";
import { DrPillAvatar } from "@/components/brand/dr-pill-avatar";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardTitle } from "@/components/ui/card";
import { ChairFillerSettingsForm } from "@/features/chair-filler/components/settings-form";
import { DEFAULT_OFFER_LIMIT } from "@/features/chair-filler/propose";
import { getChairFillerSummary } from "@/features/chair-filler/queries";
import { requireCapability } from "@/features/auth/workspace";
import { updateAssistantSettingsAction } from "@/features/assistant/actions";
import { AssistantSettingsForm } from "@/features/assistant/assistant-settings-form";
import { chatConfigured } from "@/features/assistant/chat-service";
import { CopyLink } from "@/features/invoices/components/invoice-actions";
import { RulesForm } from "@/features/assistant/components/rules-form";
import { getRules } from "@/features/assistant/queries";
import { publicEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Dr. Pill settings" };

export default async function DrPillSettingsPage() {
  const { membership } = await requireCapability("staff.manage");
  const clinic = membership.clinic;
  const supabase = await createClient();
  const { data } = await supabase
    .from("clinics")
    .select("chat_slug")
    .eq("id", clinic.id)
    .maybeSingle();
  const slug = (data as { chat_slug?: string } | null)?.chat_slug;
  const rules = await getRules(clinic.id);
  const summary = await getChairFillerSummary(clinic.id);
  const { data: cfRule } = await supabase
    .from("agent_rules")
    .select("daily_limit")
    .eq("clinic_id", clinic.id)
    .eq("kind", "chair_filler")
    .maybeSingle();
  const offerLimit =
    typeof cfRule?.daily_limit === "number" ? cfRule.daily_limit : DEFAULT_OFFER_LIMIT;
  const config = chatConfigured();
  const link = slug ? `${publicEnv().NEXT_PUBLIC_SITE_URL}/chat/${slug}` : null;

  return (
    <>
      <PageHeader eyebrow="Settings" title="Dr. Pill" />

      <Card className="flex flex-col gap-4">
        <div className="flex items-center gap-4">
          <DrPillAvatar mood="happy" size={64} decorative />
          <div>
            <CardTitle>Chat link</CardTitle>
            <p className="text-muted">
              Share this on your Facebook page, Google profile, website or at the front desk.
            </p>
          </div>
        </div>
        {link ? <CopyLink url={link} /> : null}
        {!config.ok ? (
          <p
            role="status"
            className="rounded-control bg-amber-chip text-amber-chip-ink p-4 text-sm"
          >
            Live clinic chat is paused while we validate Dr. Pill with the local synthetic Gemini
            demo. The public chat link stays unavailable and does not send clinic or patient data to
            an AI provider.
          </p>
        ) : (
          <p className="text-muted text-sm">Chat is on. Model: {config.model}.</p>
        )}
      </Card>

      <Card className="flex flex-col gap-5">
        <div>
          <CardTitle>What Dr. Pill helps with</CardTitle>
          <p className="text-muted">
            Dr. Pill never gives medical advice. Medical questions, refunds and upset patients
            always go to your team.
          </p>
        </div>
        <AssistantSettingsForm
          action={updateAssistantSettingsAction}
          initial={clinic.assistant_settings}
          submitLabel="Save"
        />
      </Card>

      <Card className="flex flex-col gap-5">
        <CardTitle>Controls and limits</CardTitle>
        <RulesForm
          bookingAutonomy={rules.book_appointment.autonomy}
          bookingLimit={rules.book_appointment.daily_limit}
          replyLimit={rules.reply.daily_limit}
        />
      </Card>

      <Card className="flex flex-col gap-5">
        <div>
          <CardTitle>Chair-Filler</CardTitle>
          <p className="text-muted">
            When an appointment is cancelled, Dr. Pill drafts offers for waitlist patients who
            agreed to be contacted. You approve each one.
          </p>
        </div>
        <ChairFillerSettingsForm
          visitValue={
            summary.avgVisitCentavos === null ? "" : String(summary.avgVisitCentavos / 100)
          }
          offerLimit={offerLimit}
        />
      </Card>
    </>
  );
}
