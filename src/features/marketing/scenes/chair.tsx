import { Check, CheckCircle2, Clock, Send } from "lucide-react";
import { ASSISTANT_NAME } from "@/config/brand";
import { at, Chapter, MascotSpot, Scene, Words } from "./shared";

const STEPS = [
  { s: 0.12, title: "A cancellation comes in", body: "The slot is freed the moment staff mark it." },
  { s: 0.3, title: `${ASSISTANT_NAME} drafts offers`, body: "Only waitlist patients who agreed to be contacted." },
  { s: 0.5, title: "You approve", body: "Nothing goes out without a yes from your staff." },
  { s: 0.72, title: "A patient accepts", body: "The chair is booked again. No phone tag." },
];

const ROWS = [
  { time: "9:00", what: "Cleaning" },
  { time: "10:00", what: "Consultation" },
  { time: "12:00", what: "Filling" },
  { time: "1:00", what: "Braces adjustment" },
];

export function ChairScene() {
  return (
    <Scene id="chair" label="Chair-Filler" len={460} tone="dark">
      <div className="mx-auto grid w-full max-w-6xl items-center gap-6 px-6 pt-16 lg:grid-cols-[1fr_1.05fr] lg:gap-14">
        <div className="flex flex-col gap-5 lg:gap-7">
          <Chapter n="01" label="Chair-Filler" />
          <h2 id="chair-title" className="story-h2">
            <Words text="A patient cancels. The chair sits empty. Not anymore." start={0} length={0.2} />
          </h2>
          <ol className="story-steps hidden flex-col gap-4 sm:flex">
            {STEPS.map((step, i) => (
              <li key={step.title} className="story-step fx" style={at(step.s, 0.08)}>
                <span className="story-step-n tabular">{i + 1}</span>
                <span className="flex flex-col">
                  <span className="font-semibold">{step.title}</span>
                  <span className="story-step-body text-sm">{step.body}</span>
                </span>
              </li>
            ))}
          </ol>
          <p className="story-now text-faint text-sm sm:hidden" aria-hidden="true">
            <span className="story-now-a">Cancellation</span>
            <span className="story-now-b">Offers drafted</span>
            <span className="story-now-c">Staff approve</span>
            <span className="story-now-d">Chair filled</span>
          </p>
        </div>

        <div className="relative">
          <MascotSpot
            mood="excited"
            rotate={8}
            className="absolute -top-11 -right-3 z-10 w-16 sm:-top-14 sm:w-24"
          />
          <div className="story-card story-schedule" data-tilt="">
            <div className="flex items-center justify-between gap-3 px-1 pb-3">
              <p className="text-sm font-semibold">Today · Main branch</p>
              <span className="story-sample">Sample data</span>
            </div>
            <ul className="flex flex-col gap-2">
              {ROWS.slice(0, 2).map((row, i) => (
                <li key={row.time} className="story-row fx fx-up" style={at(0.02 + i * 0.03, 0.06, { "--dy": "1.2rem" })}>
                  <span className="story-time tabular">{row.time}</span>
                  <span className="min-w-0 flex-1 truncate font-medium">{row.what}</span>
                  <span className="story-chip story-chip-ok">Confirmed</span>
                </li>
              ))}

              <li className="story-row story-row-hero fx fx-up" style={at(0.08, 0.06, { "--dy": "1.2rem" })}>
                <span className="story-row-bg story-row-bg-danger" aria-hidden="true" />
                <span className="story-row-bg story-row-bg-open" aria-hidden="true" />
                <span className="story-row-bg story-row-bg-ok" aria-hidden="true" />
                <span className="story-time tabular relative">11:00</span>
                <span className="story-row-label relative min-w-0 flex-1 truncate font-medium">
                  <span className="story-label-a">Check-up</span>
                  <span className="story-label-b">Open slot</span>
                  <span className="story-label-c">Booked · accepted by link</span>
                </span>
                <span className="relative inline-grid">
                  <span className="story-chip story-chip-ok story-chip-confirm">Confirmed</span>
                  <span className="story-chip story-chip-bad story-chip-cancel">Cancelled</span>
                  <span className="story-chip story-chip-new story-chip-filled">
                    <Check aria-hidden="true" /> Filled
                  </span>
                </span>
                <span className="story-offer-fly">
                  <Send aria-hidden="true" /> Offer sent
                </span>
              </li>

              {ROWS.slice(2).map((row, i) => (
                <li key={row.time} className="story-row fx fx-up" style={at(0.12 + i * 0.03, 0.06, { "--dy": "1.2rem" })}>
                  <span className="story-time tabular">{row.time}</span>
                  <span className="min-w-0 flex-1 truncate font-medium">{row.what}</span>
                  <span className="story-chip story-chip-ok">Confirmed</span>
                </li>
              ))}
            </ul>

            <div className="story-approval">
              <div className="story-waitlist">
                <p className="text-muted text-xs font-semibold tracking-[0.14em] uppercase">Waitlist</p>
                <div className="flex flex-wrap gap-2">
                  {["Offer drafted", "Offer drafted", "Offer drafted"].map((label, i) => (
                    <span key={i} className="story-chip story-chip-new fx fx-pop" style={at(0.3 + i * 0.035, 0.05)}>
                      <Clock aria-hidden="true" /> {label}
                    </span>
                  ))}
                </div>
              </div>
              <button type="button" tabIndex={-1} aria-hidden="true" className="story-approve">
                <span className="story-approve-a">Approve offer</span>
                <span className="story-approve-b">
                  <CheckCircle2 aria-hidden="true" /> Approved
                </span>
              </button>
            </div>

            <p className="story-toast">
              <CheckCircle2 aria-hidden="true" /> Slot refilled
            </p>
          </div>
        </div>
      </div>
    </Scene>
  );
}
