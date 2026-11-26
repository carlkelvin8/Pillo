import type { Metadata } from "next";
import type { ReactNode } from "react";
import { DrPillAvatar } from "@/components/brand/dr-pill-avatar";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { viewOffer, type OfferLocation, type OfferView } from "@/features/chair-filler/accept";
import { serverEnv } from "@/lib/env-server";
import { createServiceClient } from "@/lib/supabase/service";
import { acceptOfferAction, declineOfferAction } from "./actions";

// The token is in the URL: keep it out of referrers and search engines.
export const metadata: Metadata = {
  title: "Open appointment slot",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};
export const dynamic = "force-dynamic";

function Shell({
  mood,
  title,
  body,
  children,
}: {
  mood: "happy" | "sleepy" | "think";
  title: string;
  body?: string;
  children?: ReactNode;
}) {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
      <DrPillAvatar mood={mood} size={96} decorative />
      <h1 className="text-card-title">{title}</h1>
      {body ? <p className="text-muted">{body}</p> : null}
      {children}
    </main>
  );
}

function ClinicLocation({ branch, websiteUrl }: OfferLocation) {
  const latitude = branch?.latitude;
  const longitude = branch?.longitude;
  const mapUrl =
    latitude != null && longitude != null
      ? `https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=17/${latitude}/${longitude}`
      : null;
  if (!branch && !websiteUrl) return null;

  return (
    <div className="border-line flex w-full flex-col gap-1 border-t pt-4 text-sm">
      {branch ? <p className="font-semibold">{branch.name}</p> : null}
      {branch?.address ? <p className="text-muted break-words">{branch.address}</p> : null}
      <div className="flex flex-wrap justify-center gap-x-4">
        {mapUrl ? (
          <a
            href={mapUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-11 items-center underline underline-offset-4"
          >
            View branch on map
          </a>
        ) : null}
        {websiteUrl ? (
          <a
            href={websiteUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-11 items-center underline underline-offset-4"
          >
            Visit clinic website
          </a>
        ) : null}
      </div>
    </div>
  );
}

export default async function OfferPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ r?: string }>;
}) {
  const { token: raw } = await params;
  const { r } = await searchParams;
  const token = decodeURIComponent(raw);

  if (!serverEnv().SUPABASE_SERVICE_ROLE_KEY) {
    return (
      <Shell
        mood="sleepy"
        title="This page is not available yet"
        body="Please contact the clinic directly."
      />
    );
  }
  const view: OfferView = await viewOffer(createServiceClient(), token);

  // The ?r= hint only shows its message when it matches the token's real state (never for an invalid token).
  if (r === "declined" && view.state === "closed" && view.status === "declined")
    return (
      <Shell
        mood="happy"
        title="Okay po, salamat!"
        body="We'll keep you on the waitlist for the next opening."
      />
    );
  if (
    r === "taken" &&
    (view.state === "expired" || (view.state === "closed" && view.status === "expired"))
  )
    return (
      <Shell
        mood="sleepy"
        title="Sorry po, kinuha na ang slot"
        body="Someone else took it just before you. We'll keep you on the waitlist."
      />
    );

  if (view.state === "accepted")
    return (
      <Shell
        mood="happy"
        title="Booked na po!"
        body="Your appointment is confirmed. See you at the clinic. If you can't make it, please tell the clinic early."
      >
        <ClinicLocation branch={view.branch} websiteUrl={view.websiteUrl} />
      </Shell>
    );
  if (view.state === "invalid" || view.state === "closed")
    return (
      <Shell
        mood="sleepy"
        title="This offer is no longer available"
        body="Please contact the clinic if you'd like to book."
      />
    );
  if (view.state === "expired")
    return (
      <Shell
        mood="sleepy"
        title="This offer has expired"
        body="We'll keep you on the waitlist for the next opening."
      />
    );

  if (view.state !== "open") return null;
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-6 px-6 text-center">
      <DrPillAvatar mood="happy" size={96} decorative />
      <div className="flex flex-col gap-1">
        <h1 className="text-card-title">Hi {view.patientFirstName} po! May bakanteng oras</h1>
        <p className="text-muted">{view.clinicName}</p>
      </div>
      <div className="rounded-card border-line bg-surface shadow-card w-full border p-6">
        <p className="tabular text-xl font-semibold">{view.slotLabel}</p>
        <p className="text-muted">with {view.doctorName}</p>
        <div className="mt-4 empty:hidden">
          <ClinicLocation branch={view.branch} websiteUrl={view.websiteUrl} />
        </div>
      </div>
      <form action={acceptOfferAction.bind(null, token)} className="w-full">
        <SubmitButton variant="mint" className="w-full" pendingLabel="Booking…">
          Yes, book this for me
        </SubmitButton>
      </form>
      <form action={declineOfferAction.bind(null, token)} className="w-full">
        <Button type="submit" variant="ghost" className="w-full">
          No, thank you
        </Button>
      </form>
      <p className="text-muted text-xs">
        First to confirm gets the slot. This link is private to you.
      </p>
    </main>
  );
}
