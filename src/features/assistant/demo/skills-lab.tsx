"use client";

import { useActionState, useRef, useState } from "react";
import {
  Baby,
  Check,
  ChevronDown,
  Leaf,
  PawPrint,
  Send,
  ShieldCheck,
  ShieldPlus,
  Sparkles,
  Stethoscope,
  Volume2,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { DrPillAvatar, type DrPillMood } from "@/components/brand/dr-pill-avatar";
import { ASSISTANT_NAME } from "@/config/brand";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import type { ActionState } from "@/lib/action-state";
import { cn } from "@/lib/utils";
import { SyntheticDemoForm } from "./demo-form";
import { synthesizeDemoVoiceAction } from "./actions";
import { DEMO_VOICE_LINES, getDemoVoiceLine, type DemoVoiceLineId } from "./voice-lines";
import { findLocalSpeechVoice } from "../components/local-speech";

type PackId = "dental" | "veterinary" | "pediatrics" | "animal-bite" | "wellness";
type SkillId = Exclude<DemoVoiceLineId, "intro">;

const PACKS: {
  id: PackId;
  name: string;
  short: string;
  icon: LucideIcon;
  types: string[];
  intake: string[];
}[] = [
  { id: "dental", name: "Dental", short: "Chair time, recalls, and treatment coordination", icon: Stethoscope, types: ["Checkup", "Cleaning", "Restoration", "Orthodontic review"], intake: ["Reason for visit", "Preferred dentist", "Last visit"] },
  { id: "veterinary", name: "Veterinary", short: "Pet profiles, visits, and vaccination reminders", icon: PawPrint, types: ["Wellness visit", "Vaccination", "Grooming", "Urgent check"], intake: ["Pet name and species", "Pet age", "Visit reason"] },
  { id: "pediatrics", name: "Pediatrics & maternal care", short: "Child visits, caregiver details, and follow-ups", icon: Baby, types: ["Well-child visit", "Immunization", "Prenatal check", "Follow-up"], intake: ["Caregiver name", "Child age", "Visit reason"] },
  { id: "animal-bite", name: "Animal bite & vaccination", short: "Dose schedules, return visits, and escalation", icon: ShieldPlus, types: ["Initial assessment", "Vaccine dose", "Return visit", "Wound follow-up"], intake: ["Incident date", "Return schedule", "Preferred branch"] },
  { id: "wellness", name: "Wellness & hilot", short: "Session planning, practitioner availability, and reminders", icon: Leaf, types: ["Wellness session", "Hilot appointment", "Consultation", "Follow-up"], intake: ["Session type", "Preferred practitioner", "Preferred time"] },
];

const SKILLS: { id: SkillId; title: string; detail: string; prompt: string }[] = [
  { id: "schedule", title: "Appointment coordinator", detail: "Prepare a booking request for staff review.", prompt: "Find a suitable appointment time" },
  { id: "recall", title: "Recall & waitlist", detail: "Draft a recall or cancellation-fill suggestion.", prompt: "Help fill a cancelled appointment" },
  { id: "billing", title: "Invoice helper", detail: "Explain a payment step without changing money records.", prompt: "Explain how to pay an invoice" },
  { id: "intake", title: "Visit preparation", detail: "Collect only the specialty pack's demo intake fields.", prompt: "Help prepare for a first visit" },
  { id: "handoff", title: "Human handoff", detail: "Route clinical questions to a licensed professional.", prompt: "I have a medical question" },
];

const STARTERS: { label: string; prompt: string; skill: SkillId }[] = [
  { label: "Appointments", prompt: "Find a suitable appointment time", skill: "schedule" },
  { label: "Recall", prompt: "Help fill a cancelled appointment", skill: "recall" },
  { label: "Medical question", prompt: "I have a medical question", skill: "handoff" },
];

type Turn = { id: number; role: "user" | "assistant"; text: string; skill?: SkillId; voiceLineId?: DemoVoiceLineId };

function matchSkill(text: string): SkillId | null {
  const lower = text.toLowerCase();
  if (/medical|symptom|pain|fever|bleed|medicine|diagnos|treatment|dose|side effect|masakit|lagnat|gamot/.test(lower)) return "handoff";
  if (/invoice|payment|pay|bill|bayad/.test(lower)) return "billing";
  if (/cancel|waitlist|recall|remind|follow.?up|no.?show/.test(lower)) return "recall";
  if (/bring|vaccinat|vaccine|first visit|intake|prepare|preparation|check.?in|checklist/.test(lower)) return "intake";
  if (/appointment|available time|book|schedule|slot/.test(lower)) return "schedule";
  return null;
}

function responseFor(skill: SkillId, pack: (typeof PACKS)[number], prompt: string): string {
  switch (skill) {
    case "schedule":
      return `I can help prepare a ${pack.name.toLowerCase()} appointment request. Choose a visit type and preferred time, then staff can confirm an available slot. No booking was made in this demo.`;
    case "recall":
      return `I can prepare a ${pack.name.toLowerCase()} recall or cancellation-fill suggestion for staff review. A staff member must approve the message and confirm availability before anything is sent.`;
    case "billing":
      return DEMO_VOICE_LINES.billing;
    case "intake": {
      const fields = pack.intake.map((field) => field.toLowerCase());
      const checklist = fields.length > 1
        ? `${fields.slice(0, -1).join(", ")}, and ${fields.at(-1)}`
        : fields[0];
      if (/bring|vaccinat|vaccine/.test(prompt.toLowerCase())) {
        return `For a ${pack.name.toLowerCase()} vaccination visit, bring any previous vaccination records if available. The demo intake checklist is ${checklist}. Please confirm clinic-specific requirements with staff; this demo does not give medical advice.`;
      }
      return `For a ${pack.name.toLowerCase()} visit, the demo intake checklist is ${checklist}. Collect only these fields and let clinic staff review them before saving anything.`;
    }
    case "handoff":
      return DEMO_VOICE_LINES.handoff;
  }
}

const UNSUPPORTED_REPLY =
  "I can help with appointments, recalls, billing steps, or visit preparation. For medical questions, choose Medical question so clinic staff can review it. This synthetic demo does not answer clinic-specific facts or access records.";

export function DrPillSkillsLab({ demoAvailable }: { demoAvailable: boolean }) {
  const [packId, setPackId] = useState<PackId>("dental");
  const [turns, setTurns] = useState<Turn[]>([
    { id: 1, role: "assistant", text: DEMO_VOICE_LINES.intro, voiceLineId: "intro" },
  ]);
  const [message, setMessage] = useState("");
  const [speaking, setSpeaking] = useState(false);
  const nextId = useRef(2);
  const currentPack = PACKS.find((pack) => pack.id === packId) ?? PACKS[0]!;
  const lastSkill = turns.at(-1)?.skill;
  const mood: DrPillMood = speaking ? "talking" : lastSkill === "handoff" ? "think" : lastSkill ? "excited" : "happy";

  function answer(skill: SkillId | null, text: string) {
    const reply = skill ? responseFor(skill, currentPack, text) : UNSUPPORTED_REPLY;
    setTurns((previous) => [
      ...previous,
      { id: nextId.current++, role: "user", text },
      { id: nextId.current++, role: "assistant", text: reply, ...(skill ? { skill, voiceLineId: skill } : {}) },
    ]);
  }

  function submitMessage(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const clean = message.trim();
    if (!clean) return;
    answer(matchSkill(clean), clean);
    setMessage("");
  }

  return (
    <div className="flex flex-col gap-5">
      <Card className="flex min-h-[34rem] flex-col gap-4">
        <header className="flex items-center gap-3">
          <DrPillAvatar mood={mood} size={46} decorative />
          <div className="min-w-0 flex-1">
            <CardTitle>{ASSISTANT_NAME}</CardTitle>
            <p className="text-muted mt-0.5 text-sm">Local synthetic demo · {currentPack.name}</p>
          </div>
          <span className="bg-mint text-mint-ink hidden items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold sm:inline-flex">
            <ShieldCheck className="size-4" aria-hidden="true" /> Synthetic only
          </span>
        </header>

        <div role="log" aria-live="polite" aria-label="Dr. Pill conversation" className="bg-subtle flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto rounded-card p-4">
          {turns.map((turn) => (
            <div key={turn.id} className={cn("flex flex-col gap-1", turn.role === "user" && "items-end")}>
              {turn.role === "assistant" ? <span className="text-muted px-1 text-xs font-medium">{ASSISTANT_NAME}</span> : null}
              <div className={cn("flex max-w-[90%] items-end gap-2", turn.role === "user" && "flex-row-reverse")}>
                <p className={cn("rounded-card px-4 py-3 text-sm leading-6 whitespace-pre-wrap", turn.role === "assistant" ? "bg-surface text-ink" : "bg-ink text-surface")}>
                  {turn.text}
                </p>
                {turn.role === "assistant" && turn.voiceLineId ? (
                  <DemoVoiceControl lineId={turn.voiceLineId} onPlayStateChange={setSpeaking} />
                ) : null}
              </div>
            </div>
          ))}
        </div>

        {turns.length === 1 ? (
          <div className="flex flex-wrap gap-2" aria-label="Suggested prompts">
            {STARTERS.map((starter) => (
              <Button key={starter.label} variant="ghost" className="min-h-10 text-xs" onClick={() => answer(starter.skill, starter.prompt)}>
                {starter.label}
              </Button>
            ))}
          </div>
        ) : null}

        <form onSubmit={submitMessage} className="flex items-end gap-2">
          <label className="sr-only" htmlFor="pill-demo-message">Ask Dr. Pill a question</label>
          <textarea
            id="pill-demo-message"
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder="Ask about a demo workflow…"
            rows={2}
            maxLength={500}
            className="rounded-control border-line-strong min-h-11 min-w-0 flex-1 resize-y border bg-white px-3 py-2.5 text-sm"
          />
          <Button type="submit" size="icon" aria-label="Send message" disabled={!message.trim()}>
            <Send aria-hidden="true" />
          </Button>
        </form>
        <p className="text-muted text-xs">Use fictional examples only. This demo does not access clinic or patient records.</p>
      </Card>

      <details className="rounded-card border-line bg-surface shadow-card group border">
        <summary className="flex min-h-14 cursor-pointer list-none items-center gap-2 px-5 font-semibold [&::-webkit-details-marker]:hidden">
          <ChevronDown className="size-4 transition-transform group-open:rotate-180" aria-hidden="true" />
          Explore skills
          <span className="text-muted ml-auto text-xs font-normal">Specialty packs, workflows, and demo FAQ</span>
        </summary>
        <div className="border-line flex flex-col gap-5 border-t p-5">
          <section className="flex flex-col gap-4" aria-labelledby="clinic-pack-title">
            <div>
              <h2 id="clinic-pack-title" className="text-lg font-semibold">Choose a clinic pack</h2>
              <p className="text-muted mt-1 text-sm">One shared operations core, with demo workflows tailored to each specialty.</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {PACKS.map((pack) => {
                const Icon = pack.icon;
                return (
                  <button key={pack.id} type="button" onClick={() => setPackId(pack.id)} aria-pressed={packId === pack.id} className={cn("rounded-card border-line bg-surface flex min-h-28 flex-col items-start gap-2 border p-4 text-left transition-colors hover:bg-subtle", packId === pack.id && "border-ink bg-subtle ring-1 ring-ink")}>
                    <span className="flex w-full items-center justify-between gap-2"><Icon className="text-ink-2 size-5" aria-hidden="true" />{packId === pack.id ? <Check className="size-4" aria-label="Selected" /> : null}</span>
                    <span className="font-semibold">{pack.name}</span>
                    <span className="text-muted text-xs leading-5">{pack.short}</span>
                  </button>
                );
              })}
            </div>
            <div className="bg-subtle rounded-card grid gap-4 p-4 md:grid-cols-2">
              <div><p className="mb-2 text-sm font-semibold">Sample appointment types</p><div className="flex flex-wrap gap-2">{currentPack.types.map((type) => <span key={type} className="bg-surface rounded-full px-3 py-1.5 text-xs">{type}</span>)}</div></div>
              <div><p className="mb-2 text-sm font-semibold">Minimal demo intake fields</p><div className="flex flex-wrap gap-2">{currentPack.intake.map((field) => <span key={field} className="bg-surface rounded-full px-3 py-1.5 text-xs">{field}</span>)}</div></div>
            </div>
          </section>

          <section className="flex flex-col gap-3" aria-labelledby="skills-title">
            <div><h2 id="skills-title" className="text-lg font-semibold">Skills you can try</h2><p className="text-muted mt-1 text-sm">Workflow previews only. Suggestions do not write to clinic records.</p></div>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {SKILLS.map((skill) => <div key={skill.id} className="rounded-card border-line flex flex-col gap-3 border p-4"><div className="flex items-center justify-between gap-2"><h3 className="font-semibold">{skill.title}</h3><span className="bg-neutral-chip rounded-full px-2.5 py-1 text-xs">Demo</span></div><p className="text-muted min-h-10 text-sm">{skill.detail}</p><Button variant="ghost" className="w-full" onClick={() => answer(skill.id, skill.prompt)}><Sparkles aria-hidden="true" /> Try skill</Button></div>)}
            </div>
          </section>

          <section className="rounded-card border-line flex flex-col gap-4 border p-4" aria-labelledby="synthetic-faq-title">
            <div><h2 id="synthetic-faq-title" className="text-lg font-semibold">Gemini synthetic FAQ</h2><p className="text-muted mt-1 text-sm">Optional provider test. Gemini receives only one fixed fictional FAQ prompt, never your clinic data.</p></div>
            {!demoAvailable ? <p role="note" className="rounded-control bg-amber-chip text-amber-chip-ink p-4 text-sm">Gemini is unavailable in this environment. Local demo workflows remain available; live clinic AI is paused.</p> : null}
            <SyntheticDemoForm available={demoAvailable} />
          </section>
        </div>
      </details>
    </div>
  );
}

function DemoVoiceControl({ lineId, onPlayStateChange }: { lineId: DemoVoiceLineId; onPlayStateChange: (speaking: boolean) => void }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(synthesizeDemoVoiceAction, {});
  const [deviceVoiceUnavailable, setDeviceVoiceUnavailable] = useState(false);
  const line = getDemoVoiceLine(lineId)!;
  const audioBase64 = state.data?.audioBase64;

  return (
    <div className="flex flex-col items-start gap-1">
      <form action={action}>
        <input type="hidden" name="lineId" value={lineId} />
        <Button type="submit" variant="ghost" size="icon" aria-label="Play demo voice" title="Play demo voice" disabled={pending}>
          <Volume2 aria-hidden="true" />
        </Button>
      </form>
      {audioBase64 ? (
        <audio controls preload="none" className="w-44" aria-label="Dr. Pill synthetic demo voice" onPlay={() => onPlayStateChange(true)} onPause={() => onPlayStateChange(false)} onEnded={() => onPlayStateChange(false)}>
          <source src={`data:audio/wav;base64,${audioBase64}`} type="audio/wav" />
        </audio>
      ) : null}
      {state.message && !state.ok ? (
        <button type="button" className="text-muted text-xs underline" onClick={() => setDeviceVoiceUnavailable(!playDeviceVoice(line.text, onPlayStateChange))}>
          Use device voice
        </button>
      ) : null}
      {deviceVoiceUnavailable ? <span role="status" className="text-muted text-xs">No local device voice is available.</span> : null}
      {state.message ? <span role="status" className="sr-only">{state.message}</span> : null}
    </div>
  );
}

function playDeviceVoice(text: string, onState: (speaking: boolean) => void): boolean {
  if (!("speechSynthesis" in window) || typeof SpeechSynthesisUtterance === "undefined") return false;
  const voice = findLocalSpeechVoice(window.speechSynthesis.getVoices());
  if (!voice) return false;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.voice = voice;
  utterance.onstart = () => onState(true);
  utterance.onend = () => onState(false);
  utterance.onerror = () => onState(false);
  window.speechSynthesis.speak(utterance);
  return true;
}
