import Link from "next/link";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { APP_NAME } from "@/config/brand";
import { at, MascotSpot, Scene, Words } from "./shared";

const SOON = [
  "GCash",
  "QR Ph",
  "Maya",
  "Cards",
  "SMS reminders",
  "Patient portal",
  "Live Dr. Pill chat",
  "Plans and billing",
];

export function SoonScene() {
  return (
    <Scene id="soon" label="Coming soon" len={260}>
      <div className="mx-auto flex w-full flex-col items-center gap-6 px-6 pt-10 text-center">
        <MascotSpot mood="think" className="w-20 sm:w-28" />
        <h2 id="soon-title" className="story-h2 max-w-3xl">
          <span className="sr-only">Coming soon</span>
          <span aria-hidden="true">
            <Words text="Coming soon" start={0} length={0.14} />
          </span>
        </h2>
        <p className="text-ink-2 max-w-xl text-base fx fx-up" style={at(0.1, 0.1)}>
          {APP_NAME} records payments today. Online collection, reminders and a patient portal are on
          the way.
        </p>
      </div>
      <div className="story-soon-rows" aria-hidden="true">
        <div className="story-soon-row story-soon-row-a">
          {[...SOON, ...SOON].map((item, i) => (
            <span key={`${item}-${i}`} className="story-soon-pill">
              <Lock /> {item}
            </span>
          ))}
        </div>
        <div className="story-soon-row story-soon-row-b">
          {[...SOON, ...SOON].reverse().map((item, i) => (
            <span key={`${item}-${i}`} className="story-soon-pill story-soon-pill-alt">
              <Lock /> {item}
            </span>
          ))}
        </div>
      </div>
      <ul className="sr-only">
        {SOON.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </Scene>
  );
}

export function FinaleScene() {
  return (
    <Scene id="finale" label="Start" len={210} tone="dark">
      <div className="mx-auto flex w-full max-w-4xl flex-col items-center gap-5 px-6 pt-8 text-center sm:gap-7">
        <MascotSpot mood="excited" className="w-28 sm:w-44" />
        <h2 id="finale-title" className="story-finale-title">
          Your chairs. <span className="story-finale-accent">Filled.</span>
        </h2>
        <p className="text-faint max-w-lg text-base fx fx-up" style={at(0.25, 0.12)}>
          Set up your clinic in minutes. Pricing: [YOUR PRICE]
        </p>
        <div className="flex flex-col gap-3 fx fx-up sm:flex-row" style={at(0.38, 0.12)}>
          <Button asChild variant="mint" data-magnetic="" data-cursor-label="Go">
            <Link href="/signup">Create your clinic</Link>
          </Button>
          <Button
            asChild
            variant="ghost"
            className="border-ink-2 text-surface hover:bg-ink-2"
            data-magnetic=""
            data-cursor-label="Hi"
          >
            <Link href="/login">Sign in</Link>
          </Button>
        </div>
      </div>
    </Scene>
  );
}
