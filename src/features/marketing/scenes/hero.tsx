import Link from "next/link";
import { ArrowDown, CalendarCheck, CheckCircle2, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { APP_NAME, ASSISTANT_NAME } from "@/config/brand";
import { MascotSpot, Scene, vars } from "./shared";

const HEADLINE = ["Fill your empty chairs.", "Run your clinic with less typing."];

const CAPSULES = [
  { x: "6%", y: "18%", size: 3.2, speed: 0.9, rotate: -24 },
  { x: "88%", y: "14%", size: 2.4, speed: 1.4, rotate: 32 },
  { x: "46%", y: "8%", size: 1.6, speed: 0.6, rotate: 70 },
  { x: "93%", y: "70%", size: 3.6, speed: 1.1, rotate: -50 },
  { x: "3%", y: "74%", size: 2, speed: 1.6, rotate: 18 },
  { x: "58%", y: "88%", size: 2.6, speed: 0.8, rotate: -80 },
];

export function HeroScene() {
  let index = 0;
  return (
    <Scene id="hero" label="Start" len={175} className="story-hero-scene">
      <div className="story-hero-bg" aria-hidden="true">
        <span className="story-glow" />
        {CAPSULES.map((c, i) => (
          <span
            key={i}
            className="story-capsule"
            style={vars({ left: c.x, top: c.y, "--sz": `${c.size}rem`, "--sp": c.speed, "--r": c.rotate })}
          >
            <span className="story-capsule-body" style={vars({ "--d": `${i * 0.7}s` })} />
          </span>
        ))}
      </div>

      <div className="story-hero-content mx-auto grid w-full max-w-6xl items-center gap-4 px-6 pt-20 lg:grid-cols-[1.2fr_0.8fr] lg:gap-10">
        <div className="flex flex-col gap-5 sm:gap-7">
          <p className="story-hero-chip bg-mint text-mint-ink w-fit rounded-full px-4 py-1.5 text-xs font-semibold sm:text-sm">
            Made for clinics in the Philippines
          </p>
          <h1 id="hero-title" className="story-h1">
            {HEADLINE.map((line) => (
              <span key={line} className="block">
                {line.split(" ").map((word) => (
                  <span key={`${word}-${index}`}>
                    <span className="story-mask">
                      <span className="story-mask-in" style={vars({ "--i": index++ })}>
                        {word}
                      </span>
                    </span>{" "}
                  </span>
                ))}
              </span>
            ))}
          </h1>
          <p className="story-hero-sub text-ink-2 max-w-xl text-base sm:text-lg">
            {APP_NAME} is a supervised AI front desk with appointments, patient records and a payment
            logbook in one place. {ASSISTANT_NAME} drafts the work. Your staff approve it.
          </p>
          <div className="story-hero-cta flex flex-col gap-3 sm:flex-row">
            <Button asChild className="story-cta" data-magnetic="" data-cursor-label="Start">
              <Link href="/signup">Create your clinic</Link>
            </Button>
            <Button asChild variant="ghost" data-magnetic="" data-cursor-label="Hi">
              <Link href="/login">Sign in</Link>
            </Button>
          </div>
        </div>

        <div className="story-orbit relative mx-auto flex aspect-square w-full max-w-[22rem] items-center justify-center lg:max-w-md">
          <span className="story-ring story-ring-a" aria-hidden="true" />
          <span className="story-ring story-ring-b" aria-hidden="true" />
          <MascotSpot mood="happy" className="w-24 sm:w-40 lg:w-56" />
          <span className="story-float story-float-1 bg-surface border-line shadow-card" style={vars({ "--d": "0s" })}>
            <CheckCircle2 aria-hidden="true" className="text-mint-ink" /> Slot refilled
          </span>
          <span className="story-float story-float-2 bg-surface border-line shadow-card" style={vars({ "--d": "0.9s" })}>
            <CalendarCheck aria-hidden="true" className="text-mint-ink" /> New booking
          </span>
          <span className="story-float story-float-3 bg-surface border-line shadow-card" style={vars({ "--d": "1.7s" })}>
            <Wallet aria-hidden="true" className="text-mint-ink" /> Payment recorded
          </span>
        </div>
      </div>

      <p className="story-scroll-cue text-muted absolute bottom-6 left-1/2 flex -translate-x-1/2 items-center gap-2 text-xs font-semibold tracking-[0.18em] uppercase">
        <ArrowDown aria-hidden="true" className="size-4" /> Scroll
      </p>
    </Scene>
  );
}

const BAND = [
  "Appointments",
  "Patient records",
  "Invoices",
  "Payment records",
  "Chair-Filler",
  `${ASSISTANT_NAME}`,
  "Branches",
  "Audit log",
];

/** Two bands that slide sideways as you scroll, one each way. Decorative. */
export function MarqueeBands() {
  const row = [...BAND, ...BAND, ...BAND];
  return (
    <div data-scene="bands" data-passive="" className="story-scene story-bands" aria-hidden="true">
      <div className="story-band story-band-a">
        <div className="story-band-track">
          {row.map((item, i) => (
            <span key={`${item}-${i}`}>
              {item}
              <i />
            </span>
          ))}
        </div>
      </div>
      <div className="story-band story-band-b">
        <div className="story-band-track">
          {row.map((item, i) => (
            <span key={`${item}-${i}`}>
              {item}
              <i />
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
