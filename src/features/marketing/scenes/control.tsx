import { ClipboardCheck, Lock, ShieldCheck, Users } from "lucide-react";
import { ASSISTANT_NAME } from "@/config/brand";
import { at, Chapter, MascotSpot, Scene, Words } from "./shared";

const LOG = [
  { s: 0.34, text: `${ASSISTANT_NAME} drafted 3 offers` },
  { s: 0.46, text: "Staff approved 1 offer" },
  { s: 0.58, text: "Slot booked from the offer link" },
  { s: 0.7, text: "Patient record opened. Logged" },
];

const SAFE = [
  { s: 0.62, icon: <ShieldCheck aria-hidden="true" />, title: "Separate clinic data" },
  { s: 0.72, icon: <Users aria-hidden="true" />, title: "Roles decide who sees what" },
  { s: 0.82, icon: <ClipboardCheck aria-hidden="true" />, title: "Every action in an audit log" },
];

export function ControlScene() {
  return (
    <Scene id="control" label="Control" len={340} tone="dark">
      <div className="mx-auto grid w-full max-w-6xl items-center gap-6 px-6 pt-16 lg:grid-cols-2 lg:gap-16">
        <div className="flex flex-col gap-5 lg:gap-7">
          <Chapter n="04" label="Control" />
          <h2 id="control-title" className="story-h2">
            <Words text="Supervised, not on autopilot. You stay in control." start={0} length={0.22} />
          </h2>
          <div className="story-dial fx fx-up" style={at(0.12, 0.1)}>
            <div className="story-dial-track" aria-hidden="true">
              <span className="story-dial-knob" />
              <span className="story-dial-opt story-dial-suggest">Suggest</span>
              <span className="story-dial-opt story-dial-approve">Approve</span>
              <span className="story-dial-opt story-dial-auto">
                <Lock aria-hidden="true" /> Auto
              </span>
            </div>
            <p className="text-faint text-sm">
              Every action {ASSISTANT_NAME} takes is a suggestion or waits for approval. Autopilot
              is not available.
            </p>
          </div>
        </div>

        <div className="relative flex flex-col gap-4">
          <MascotSpot
            mood="happy"
            rotate={-8}
            className="absolute -top-11 -right-2 z-10 w-14 sm:-top-14 sm:w-24"
          />
          <div className="story-card story-log" data-tilt="">
            <div className="flex items-center justify-between gap-3 pb-3">
              <p className="text-sm font-semibold">Activity log</p>
              <span className="story-sample">Sample data</span>
            </div>
            <ol className="flex flex-col gap-3">
              {LOG.map((entry) => (
                <li key={entry.text} className="story-log-row fx fx-up" style={at(entry.s, 0.08, { "--dy": "1rem" })}>
                  <span className="story-log-dot" aria-hidden="true" />
                  {entry.text}
                </li>
              ))}
            </ol>
          </div>
          <ul className="grid gap-3 sm:grid-cols-3">
            {SAFE.map((item) => (
              <li key={item.title} className="story-safe fx" style={at(item.s, 0.08)}>
                {item.icon}
                <span className="text-sm font-semibold">{item.title}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Scene>
  );
}
