import Link from "next/link";
import {
  CalendarCheck,
  ClipboardList,
  Armchair,
  ShieldCheck,
  Wallet,
  MessageCircle,
} from "lucide-react";
import type { ReactNode } from "react";
import { DrPillAvatar } from "@/components/brand/dr-pill-avatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { APP_NAME, ASSISTANT_NAME } from "@/config/brand";

const FEATURES: { icon: ReactNode; title: string; body: string }[] = [
  {
    icon: <Armchair aria-hidden="true" />,
    title: "Chair-Filler",
    body: "When a patient cancels or no-shows, offer the open slot to waiting and recall patients who agreed to be contacted. Staff approve every offer before it goes out.",
  },
  {
    icon: <MessageCircle aria-hidden="true" />,
    title: `${ASSISTANT_NAME}, your front desk`,
    body: "Answers common questions and books appointments in English and Taglish. Medical questions, refunds and upset patients are handed to your staff.",
  },
  {
    icon: <CalendarCheck aria-hidden="true" />,
    title: "Appointments",
    body: "Branches, doctors, opening hours and a waitlist. The database blocks double-booking.",
  },
  {
    icon: <ClipboardList aria-hidden="true" />,
    title: "Patient records",
    body: "A patient directory with visits and prescriptions limited to doctors and owners. Opening a record is logged.",
  },
  {
    icon: <Wallet aria-hidden="true" />,
    title: "Invoices and payment records",
    body: "Create invoices and record cash, bank, GCash and Maya payments received. A simple logbook of what the clinic collected.",
  },
  {
    icon: <ShieldCheck aria-hidden="true" />,
    title: "Built for patient data",
    body: "Each clinic's data is separated, roles control who sees what, and activity is written to an audit log.",
  },
];

const STEPS = [
  { title: "Set up your clinic", body: "Add your branches, doctors and opening hours." },
  {
    title: `Let ${ASSISTANT_NAME} help`,
    body: "Patients chat to book. Your staff stay in control and can take over any conversation.",
  },
  {
    title: "Fill the empty chairs",
    body: "Review suggested offers for cancelled slots and approve the ones you want.",
  },
  {
    title: "Record what you collect",
    body: "Log payments against invoices and see the month at a glance.",
  },
];

const SOON = ["GCash", "QR Ph", "Maya", "Cards", "Reminders by SMS", "Patient portal"];

export function Landing() {
  return (
    <div className="bg-canvas text-ink min-h-screen">
      <header className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-6 py-4">
        <Link href="/" className="inline-flex min-h-11 items-center text-lg font-semibold">
          {APP_NAME}
        </Link>
        <nav aria-label="Account" className="flex items-center gap-2">
          <Button asChild variant="ghost">
            <Link href="/login">Sign in</Link>
          </Button>
          <Button asChild className="hidden sm:inline-flex">
            <Link href="/signup">Get started</Link>
          </Button>
        </nav>
      </header>

      <main>
        <section className="mx-auto grid max-w-6xl items-center gap-10 px-6 py-10 sm:py-16 lg:grid-cols-2">
          <div className="flex flex-col gap-6">
            <Chip tone="success" className="w-fit">
              Made for clinics in the Philippines
            </Chip>
            <h1 className="text-title">
              Fill your empty chairs. Run your clinic with less typing.
            </h1>
            <p className="text-muted max-w-prose text-base">
              {APP_NAME} is a supervised AI front desk with appointments, patient records and a
              payment logbook in one place. {ASSISTANT_NAME} drafts the work, your staff approve it.
            </p>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button asChild>
                <Link href="/signup">Create your clinic</Link>
              </Button>
              <Button asChild variant="ghost">
                <Link href="/login">Sign in</Link>
              </Button>
            </div>
          </div>
          <div className="bg-mint rounded-hero flex justify-center p-8">
            <DrPillAvatar mood="happy" size={180} />
          </div>
        </section>

        <section aria-labelledby="features" className="mx-auto max-w-6xl px-6 py-10">
          <h2 id="features" className="text-card-title mb-6 text-2xl">
            What you get
          </h2>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <li key={f.title} className="flex">
                <Card className="flex w-full flex-col gap-3">
                  <span className="bg-mint text-mint-ink rounded-control flex size-11 items-center justify-center [&_svg]:size-5">
                    {f.icon}
                  </span>
                  <h3 className="text-card-title">{f.title}</h3>
                  <p className="text-muted text-sm">{f.body}</p>
                </Card>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="how" className="mx-auto max-w-6xl px-6 py-10">
          <h2 id="how" className="text-card-title mb-6 text-2xl">
            How it works
          </h2>
          <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((s, i) => (
              <li key={s.title} className="flex">
                <Card className="flex w-full flex-col gap-2">
                  <span className="bg-ink text-surface tabular flex size-8 items-center justify-center rounded-full text-sm font-semibold">
                    {i + 1}
                  </span>
                  <h3 className="text-card-title">{s.title}</h3>
                  <p className="text-muted text-sm">{s.body}</p>
                </Card>
              </li>
            ))}
          </ol>
        </section>

        <section aria-labelledby="soon" className="mx-auto max-w-6xl px-6 py-10">
          <Card className="flex flex-col gap-4">
            <h2 id="soon" className="text-card-title text-2xl">
              Coming soon
            </h2>
            <p className="text-muted text-sm">
              {APP_NAME} records payments today. Online collection and more are on the way.
            </p>
            <ul className="flex flex-wrap gap-2">
              {SOON.map((item) => (
                <li key={item}>
                  <Chip tone="neutral">{item}</Chip>
                </li>
              ))}
            </ul>
          </Card>
        </section>

        <section aria-labelledby="start" className="mx-auto max-w-6xl px-6 py-10 pb-16">
          <Card variant="hero" className="flex flex-col items-start gap-4">
            <h2 id="start" className="text-2xl font-semibold">
              Ready to try {APP_NAME}?
            </h2>
            <p className="text-faint text-sm">Pricing: [YOUR PRICE]</p>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button asChild variant="mint">
                <Link href="/signup">Get started</Link>
              </Button>
              <Button asChild variant="ghost" className="border-ink-2 text-surface hover:bg-ink-2">
                <Link href="/login">Sign in</Link>
              </Button>
            </div>
          </Card>
        </section>
      </main>

      <footer className="border-line border-t px-6 py-6 text-center text-sm">
        <p className="text-muted">
          © {new Date().getFullYear()} {APP_NAME}
        </p>
      </footer>
    </div>
  );
}
