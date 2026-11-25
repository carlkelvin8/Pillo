import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { DrPillAvatar } from "@/components/brand/dr-pill-avatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { ASSISTANT_NAME } from "@/config/brand";
import { AssistantSettingsForm } from "@/features/assistant/assistant-settings-form";
import { ROLE_LABELS } from "@/features/auth/permissions";
import { requireUser } from "@/features/auth/workspace";
import {
  completeOnboardingAction,
  createClinicAction,
  saveAssistantSettingsAction,
} from "@/features/clinic/actions";
import { ClinicDetailsForm } from "@/features/clinic/components/clinic-details-form";
import { StepIndicator } from "@/features/onboarding/components/step-indicator";
import { InviteForm } from "@/features/staff/components/invite-form";
import { RevokeButton } from "@/features/staff/components/revoke-button";
import { listPendingInvitations } from "@/features/staff/queries";
import { SubmitButton } from "@/components/ui/submit-button";

export const metadata: Metadata = { title: "Set up your clinic" };

type Props = { searchParams: Promise<{ step?: string }> };
type Step = 1 | 2 | 3 | 4;

function resolveStep(hasClinic: boolean, raw: string | undefined): Step {
  if (!hasClinic) return 1;
  const n = Number(raw);
  return n === 3 || n === 4 ? n : 2;
}

export default async function OnboardingPage({ searchParams }: Props) {
  const ws = await requireUser();
  const { step: rawStep } = await searchParams;

  const { membership } = ws;
  // Invited staff join an existing clinic; only the owner runs setup, and only once.
  if (membership && (membership.role !== "owner" || membership.clinic.onboarding_completed_at)) {
    redirect("/dashboard");
  }
  const step = resolveStep(membership !== null, rawStep);

  return (
    <>
      <StepIndicator current={step} />

      {step === 1 ? (
        <section className="flex flex-col gap-6">
          <div>
            <h1 className="text-title">Set up your clinic</h1>
            <p className="text-muted mt-2 text-base">
              Tell us about your clinic. You can change this later.
            </p>
          </div>
          <Card>
            <ClinicDetailsForm action={createClinicAction} submitLabel="Continue" />
          </Card>
        </section>
      ) : null}

      {step === 2 && membership ? <TeamStep clinicId={membership.clinic.id} /> : null}

      {step === 3 && membership ? (
        <section className="flex flex-col gap-6">
          <div className="flex items-center gap-5">
            <DrPillAvatar mood="wink" size={88} decorative />
            <div>
              <h1 className="text-title">Meet {ASSISTANT_NAME}</h1>
              <p className="text-muted mt-2 text-base">
                {ASSISTANT_NAME} is your assistant for bookings, reminders and payments. Choose what{" "}
                {ASSISTANT_NAME} helps with.
              </p>
            </div>
          </div>
          <AssistantSettingsForm
            action={saveAssistantSettingsAction}
            initial={membership.clinic.assistant_settings}
            submitLabel="Continue"
            secondary={
              <Button asChild variant="ghost">
                <Link href="/onboarding?step=2">Back</Link>
              </Button>
            }
          />
        </section>
      ) : null}

      {step === 4 && membership ? (
        <section className="flex flex-col gap-6">
          <div>
            <h1 className="text-title">Get paid</h1>
            <p className="text-muted mt-2 text-base">
              Collect GCash, Maya and card payments from patients. You will connect payments from
              the Payments page when it is ready. Nothing to do now.
            </p>
          </div>
          <Card>
            <form
              action={completeOnboardingAction}
              className="flex items-center justify-between gap-3"
            >
              <Button asChild variant="ghost">
                <Link href="/onboarding?step=3">Back</Link>
              </Button>
              <SubmitButton variant="mint" pendingLabel="Finishing…">
                Finish setup
              </SubmitButton>
            </form>
          </Card>
        </section>
      ) : null}
    </>
  );
}

async function TeamStep({ clinicId }: { clinicId: string }) {
  const invitations = await listPendingInvitations(clinicId);
  return (
    <section className="flex flex-col gap-6">
      <div>
        <h1 className="text-title">Invite your team</h1>
        <p className="text-muted mt-2 text-base">
          Add doctors, reception and billing. No email is sent yet: they get access when they create
          an account with the address you enter. You can skip this and do it later in Settings.
        </p>
      </div>
      <Card className="flex flex-col gap-5">
        <InviteForm />
        {invitations.length > 0 ? (
          <ul
            aria-label="Pending invitations"
            className="divide-line border-line flex flex-col divide-y border-t"
          >
            {invitations.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center gap-3 py-3">
                <span className="min-w-0 flex-1 truncate font-medium">{i.email}</span>
                <Chip tone="neutral">{ROLE_LABELS[i.role]}</Chip>
                <RevokeButton invitationId={i.id} />
              </li>
            ))}
          </ul>
        ) : null}
      </Card>
      <div className="flex justify-end">
        <Button asChild>
          <Link href="/onboarding?step=3">
            {invitations.length > 0 ? "Continue" : "Skip for now"}
          </Link>
        </Button>
      </div>
    </section>
  );
}
