import { Check, UserRound } from "lucide-react";
import { DrPillAvatar } from "@/components/brand/dr-pill-avatar";
import { ASSISTANT_NAME } from "@/config/brand";
import { at, Chapter, MascotSpot, Scene, Words } from "./shared";

type Message = { from: "patient" | "pill"; text: string; s: number; typing?: number };

/** A sample conversation (illustration). Medical questions are handed to staff. */
const MESSAGES: Message[] = [
  { from: "patient", text: "Hi! May slot ba bukas ng hapon para sa cleaning?", s: 0.08 },
  {
    from: "pill",
    text: "Meron po! 2:00 PM at 4:30 PM po. Alin po ang gusto ninyo?",
    s: 0.22,
    typing: 0.15,
  },
  { from: "patient", text: "4:30 po", s: 0.34 },
  { from: "pill", text: "Booked na po ang 4:30 PM bukas. Salamat po!", s: 0.47, typing: 0.4 },
  { from: "patient", text: "Masakit pa rin ngipin ko. Anong gamot ang pwede?", s: 0.58 },
  {
    from: "pill",
    text: "Hindi po ako puwedeng magbigay ng medical advice. Ipapasa ko po kayo sa aming staff.",
    s: 0.7,
    typing: 0.63,
  },
];

const POINTS = [
  { s: 0.2, text: "Books in English and Taglish" },
  { s: 0.4, text: "Never gives medical advice. It hands over to staff" },
  { s: 0.58, text: "Emergency words skip the AI and show 911 guidance" },
  { s: 0.76, text: "Your staff can take over any chat" },
];

export function DeskScene() {
  return (
    <Scene id="desk" label="Front desk" len={400}>
      <div className="mx-auto grid w-full max-w-6xl items-center gap-6 px-6 pt-16 lg:grid-cols-[1fr_auto] lg:gap-20">
        <div className="flex flex-col gap-5 lg:gap-7">
          <Chapter n="02" label="Front desk" />
          <h2 id="desk-title" className="story-h2">
            <Words text="A front desk that never clocks out." start={0} length={0.2} />
          </h2>
          <ul className="hidden flex-col gap-3 sm:flex">
            {POINTS.map((point) => (
              <li key={point.text} className="story-point fx" style={at(point.s, 0.08)}>
                <span className="story-point-check">
                  <Check aria-hidden="true" />
                </span>
                {point.text}
              </li>
            ))}
          </ul>
        </div>

        <div className="relative mx-auto">
          <MascotSpot
            mood="talking"
            rotate={-8}
            className="absolute -top-9 -right-6 z-10 w-14 sm:top-auto sm:-bottom-3 sm:-left-16 sm:w-24"
          />
          <div className="story-phone" data-tilt="">
            <div className="story-phone-bar">
              <span className="story-phone-avatar" aria-hidden="true">
                <DrPillAvatar mood="happy" size={40} decorative className="story-face story-face-a" />
                <DrPillAvatar mood="talking" size={40} decorative className="story-face story-face-b" />
                <DrPillAvatar mood="think" size={40} decorative className="story-face story-face-c" />
              </span>
              <span className="flex min-w-0 flex-col leading-tight">
                <span className="text-sm font-semibold">{ASSISTANT_NAME}</span>
                <span className="text-muted text-xs">Sample conversation</span>
              </span>
            </div>
            <div className="story-chat" role="img" aria-label="Sample chat: a patient books a cleaning with Dr. Pill, then asks a medical question and is handed to staff.">
              {MESSAGES.map((m) => (
                <div key={m.text} className="contents">
                  {m.typing !== undefined ? (
                    <div className="story-typing story-msg-row story-msg-pill" style={at(m.typing, 0.07, { "--e": m.s })}>
                      <span className="story-bubble story-bubble-pill">
                        <i />
                        <i />
                        <i />
                      </span>
                    </div>
                  ) : null}
                  <div
                    className={`story-msg fx story-msg-row ${m.from === "patient" ? "story-msg-patient" : "story-msg-pill"}`}
                    style={at(m.s, 0.07)}
                  >
                    <span className={`story-bubble ${m.from === "patient" ? "story-bubble-patient" : "story-bubble-pill"}`}>
                      {m.text}
                    </span>
                  </div>
                </div>
              ))}
              <div className="story-handoff fx" style={at(0.78, 0.07)}>
                <UserRound aria-hidden="true" /> Handed to staff
              </div>
            </div>
          </div>
        </div>
      </div>
    </Scene>
  );
}
