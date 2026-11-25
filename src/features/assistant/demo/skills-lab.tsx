"use client";

import { useEffect, useRef, useState } from "react";
import {
  AudioLines,
  Check,
  ChevronDown,
  ChevronUp,
  CircleHelp,
  Mic,
  MicOff,
  Send,
  ShieldCheck,
  Sparkles,
  Volume2,
  VolumeX,
} from "lucide-react";
import { DrPillAvatar, type DrPillMood } from "@/components/brand/dr-pill-avatar";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { SyntheticDemoForm } from "./demo-form";

type PackId = "dental" | "veterinary" | "pediatrics" | "animal-bite" | "wellness";
type SkillId = "schedule" | "recall" | "billing" | "intake" | "handoff";

const PACKS: {
  id: PackId;
  name: string;
  short: string;
  icon: string;
  types: string[];
  intake: string[];
}[] = [
  {
    id: "dental",
    name: "Dental",
    short: "Chair time, recalls, and treatment coordination",
    icon: "🦷",
    types: ["Checkup", "Cleaning", "Restoration", "Orthodontic review"],
    intake: ["Reason for visit", "Preferred dentist", "Last visit"],
  },
  {
    id: "veterinary",
    name: "Veterinary",
    short: "Pet profiles, visits, and vaccination reminders",
    icon: "🐾",
    types: ["Wellness visit", "Vaccination", "Grooming", "Urgent check"],
    intake: ["Pet name and species", "Pet age", "Visit reason"],
  },
  {
    id: "pediatrics",
    name: "Pediatrics & maternal care",
    short: "Child visits, caregiver details, and follow-ups",
    icon: "🧸",
    types: ["Well-child visit", "Immunization", "Prenatal check", "Follow-up"],
    intake: ["Caregiver name", "Child age", "Visit reason"],
  },
  {
    id: "animal-bite",
    name: "Animal bite & vaccination",
    short: "Dose schedules, return visits, and escalation",
    icon: "🩹",
    types: ["Initial assessment", "Vaccine dose", "Return visit", "Wound follow-up"],
    intake: ["Incident date", "Return schedule", "Preferred branch"],
  },
  {
    id: "wellness",
    name: "Wellness & hilot",
    short: "Session planning, practitioner availability, and reminders",
    icon: "🌿",
    types: ["Wellness session", "Hilot appointment", "Consultation", "Follow-up"],
    intake: ["Session type", "Preferred practitioner", "Preferred time"],
  },
];

const SKILLS: { id: SkillId; title: string; detail: string; prompt: string }[] = [
  { id: "schedule", title: "Appointment coordinator", detail: "Prepare a booking request for staff review.", prompt: "Find a suitable appointment time" },
  { id: "recall", title: "Recall & waitlist", detail: "Draft a recall or cancellation-fill suggestion.", prompt: "Help fill a cancelled appointment" },
  { id: "billing", title: "Invoice helper", detail: "Explain a payment step without changing money records.", prompt: "Explain how to pay an invoice" },
  { id: "intake", title: "Visit preparation", detail: "Collect only the specialty pack's demo intake fields.", prompt: "Help prepare for a first visit" },
  { id: "handoff", title: "Human handoff", detail: "Route clinical questions to a licensed professional.", prompt: "I have a medical question" },
];

const RESPONSES: Record<SkillId, (packName: string) => string> = {
  schedule: (name) => `I can help prepare a ${name.toLowerCase()} appointment request. Choose a visit type and preferred time, then staff can confirm an available slot. No booking was made in this demo.`,
  recall: (name) => `I can prepare a ${name.toLowerCase()} recall or cancellation-fill suggestion for staff review. A staff member must approve the message and confirm availability before anything is sent.`,
  billing: () => "I can show staff how to share an invoice payment link. This demo does not open invoices, create links, or record payments.",
  intake: (name) => `For a ${name.toLowerCase()} visit, the demo intake checklist is ready. Collect only the fields shown in this selected pack, and let clinic staff review them before saving anything.`,
  handoff: () => "I can’t assess symptoms or give treatment advice. I’ll direct this to a licensed clinician or clinic staff member. If someone may be in immediate danger, contact local emergency services now.",
};

type Turn = { id: number; role: "user" | "assistant"; text: string; skill?: SkillId };

type SpeechRecognitionResultLike = { transcript: string };
type SpeechRecognitionEventLike = { results: ArrayLike<ArrayLike<SpeechRecognitionResultLike>> };
type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};
type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

function matchSkill(text: string): SkillId {
  const lower = text.toLowerCase();
  if (/medical|symptom|pain|fever|bleed|medicine|diagnos|treatment|masakit|lagnat|gamot/.test(lower)) return "handoff";
  if (/invoice|payment|pay|bill|bayad/.test(lower)) return "billing";
  if (/cancel|waitlist|recall|remind|follow.?up|no.?show/.test(lower)) return "recall";
  if (/first visit|intake|prepare|preparation|check.?in/.test(lower)) return "intake";
  return "schedule";
}

export function DrPillSkillsLab({ demoAvailable }: { demoAvailable: boolean }) {
  const [packId, setPackId] = useState<PackId>("dental");
  const [turns, setTurns] = useState<Turn[]>([
    { id: 1, role: "assistant", text: "Hi! I’m your local demo companion. Pick a clinic pack and try a workflow. This demo uses fictional examples only." },
  ]);
  const [message, setMessage] = useState("");
  const [isOpen, setIsOpen] = useState(true);
  const [recording, setRecording] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [voiceOn, setVoiceOn] = useState(false);
  const [notice, setNotice] = useState("");
  const [recordedUrl, setRecordedUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [approval, setApproval] = useState<string | null>(null);
  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const audioChunks = useRef<Blob[]>([]);
  const recognition = useRef<SpeechRecognitionLike | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const currentPack = PACKS.find((pack) => pack.id === packId) ?? PACKS[0]!;
  const latestTurn = turns.at(-1);
  const mood: DrPillMood = speaking || isPlaying
    ? "talking"
    : recording
      ? "listening"
      : latestTurn?.skill === "handoff"
        ? "think"
        : latestTurn?.skill
          ? "excited"
          : "happy";

  useEffect(() => () => {
    recognition.current?.stop();
    if (recordedUrl) URL.revokeObjectURL(recordedUrl);
  }, [recordedUrl]);

  function answer(skill: SkillId, text: string) {
    const response = RESPONSES[skill](currentPack.name);
    setTurns((previous) => [
      ...previous,
      { id: Date.now(), role: "user", text, skill },
      { id: Date.now() + 1, role: "assistant", text: response, skill },
    ]);
    setApproval(skill === "handoff" ? "Clinical question · route to licensed staff" : skill === "schedule" || skill === "recall" ? `${SKILLS.find((item) => item.id === skill)?.title} · staff approval required` : null);
    setNotice("");
    if (voiceOn) speak(response);
  }

  function submitMessage(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const clean = message.trim();
    if (!clean) return;
    answer(matchSkill(clean), clean);
    setMessage("");
  }

  function startDictation() {
    if (recording && !mediaRecorder.current) {
      recognition.current?.stop();
      setRecording(false);
      setNotice("Speech recognition stopped.");
      return;
    }
    if (recording && mediaRecorder.current) return;
    const speechWindow = window as Window & { SpeechRecognition?: SpeechRecognitionConstructor; webkitSpeechRecognition?: SpeechRecognitionConstructor };
    const SpeechRecognition = speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setNotice("Speech-to-text is not available in this browser. You can type a demo prompt instead.");
      return;
    }
    const instance = new SpeechRecognition();
    instance.lang = "en-PH";
    instance.interimResults = false;
    instance.onresult = (event) => {
      const transcript = event.results[0]?.[0]?.transcript?.trim();
      if (transcript) setMessage((previous) => `${previous}${previous ? " " : ""}${transcript}`);
    };
    instance.onerror = () => setNotice("Speech recognition stopped. Try again or type a demo prompt.");
    instance.onend = () => setRecording(false);
    recognition.current = instance;
    setNotice("Listening. Use fictional demo details only; browser speech recognition may use its own processing service.");
    setRecording(true);
    instance.start();
  }

  async function toggleVoiceNote() {
    if (mediaRecorder.current?.state === "recording") {
      mediaRecorder.current.stop();
      setRecording(false);
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setNotice("Audio recording is not supported in this browser.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      mediaRecorder.current = recorder;
      audioChunks.current = [];
      recorder.ondataavailable = (event) => { if (event.data.size) audioChunks.current.push(event.data); };
      recorder.onstop = () => {
        const blob = new Blob(audioChunks.current, { type: recorder.mimeType || "audio/webm" });
        const nextUrl = URL.createObjectURL(blob);
        setRecordedUrl((previous) => { if (previous) URL.revokeObjectURL(previous); return nextUrl; });
        stream.getTracks().forEach((track) => track.stop());
        mediaRecorder.current = null;
        setNotice("Voice note saved in this browser tab only. It is not uploaded or retained after you leave.");
      };
      recorder.start();
      setRecording(true);
      setNotice("Recording locally. Speak only fictional demo content; nothing is uploaded.");
    } catch {
      setNotice("Microphone access was not available. Check browser permissions or continue with text.");
    }
  }

  function speak(text: string) {
    if (!("speechSynthesis" in window)) {
      setNotice("Text-to-speech is not available in this browser.");
      return;
    }
    window.speechSynthesis.cancel();
    setSpeaking(false);
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.onstart = () => setSpeaking(true);
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);
    window.speechSynthesis.speak(utterance);
  }

  const latestReply = turns.at(-1)?.role === "assistant" ? turns.at(-1)?.text : undefined;

  return (
    <div className="flex flex-col gap-6">
      <Card className="flex flex-col gap-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <CardTitle>Choose a clinic skill pack</CardTitle>
            <p className="text-muted mt-1 text-sm">One shared operations core, with demo workflows tailored to each specialty.</p>
          </div>
          <span className="bg-mint text-mint-ink inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold"><ShieldCheck className="size-4" /> Local synthetic demo</span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {PACKS.map((pack) => (
            <button key={pack.id} type="button" onClick={() => { setPackId(pack.id); setApproval(null); }} aria-pressed={packId === pack.id} className={cn("rounded-card border-line bg-surface flex min-h-28 flex-col items-start gap-2 border p-4 text-left transition-colors hover:bg-subtle", packId === pack.id && "border-ink bg-subtle ring-1 ring-ink")}>
              <span className="flex w-full items-center justify-between gap-2"><span className="text-lg" aria-hidden="true">{pack.icon}</span>{packId === pack.id ? <Check className="size-4" aria-label="Selected" /> : null}</span>
              <span className="font-semibold">{pack.name}</span>
              <span className="text-muted text-xs leading-5">{pack.short}</span>
            </button>
          ))}
        </div>
        <div className="bg-subtle rounded-card grid gap-5 p-4 md:grid-cols-2">
          <div><p className="mb-2 text-sm font-semibold">Sample appointment types</p><div className="flex flex-wrap gap-2">{currentPack.types.map((type) => <span key={type} className="bg-surface rounded-full px-3 py-1.5 text-xs">{type}</span>)}</div></div>
          <div><p className="mb-2 text-sm font-semibold">Minimal demo intake fields</p><div className="flex flex-wrap gap-2">{currentPack.intake.map((field) => <span key={field} className="bg-surface rounded-full px-3 py-1.5 text-xs">{field}</span>)}</div></div>
        </div>
      </Card>

      <Card className="flex flex-col gap-5">
        <div className="flex flex-wrap items-end justify-between gap-3"><div><CardTitle>Skills you can try</CardTitle><p className="text-muted mt-1 text-sm">Workflow previews only. Scheduling and recall suggestions never write to clinic records.</p></div><span className="text-muted text-xs">5 demo skills</span></div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {SKILLS.map((skill) => <div key={skill.id} className="rounded-card border-line flex flex-col gap-3 border p-4"><div className="flex items-center justify-between gap-2"><h3 className="font-semibold">{skill.title}</h3><span className="bg-neutral-chip rounded-full px-2.5 py-1 text-xs">Demo</span></div><p className="text-muted min-h-10 text-sm">{skill.detail}</p><Button variant="ghost" className="w-full" onClick={() => answer(skill.id, skill.prompt)}><Sparkles /> Try skill</Button></div>)}
        </div>
      </Card>

      <Card className="flex flex-col gap-4">
        <div><CardTitle>Gemini synthetic FAQ</CardTitle><p className="text-muted mt-1 text-sm">Optional provider test. Gemini receives only one of the fixed fictional FAQ prompts—never your clinic data.</p></div>
        {!demoAvailable ? <p role="note" className="rounded-control bg-amber-chip text-amber-chip-ink p-4 text-sm">Gemini is unavailable in this environment. The local skills and voice demo above still work; live clinic AI remains paused.</p> : null}
        <SyntheticDemoForm available={demoAvailable} />
      </Card>

      <div className="fixed bottom-5 right-5 z-40 flex flex-col items-end gap-3 sm:bottom-8 sm:right-8">
        {isOpen ? (
          <section aria-label="Dr. Pill demo companion" className="bg-surface border-line shadow-card w-[min(26rem,calc(100vw-2rem))] overflow-hidden rounded-card border">
            <header className="bg-ink text-surface flex items-center justify-between gap-3 px-4 py-3">
              <div className="flex items-center gap-3"><DrPillAvatar mood={mood} size={42} decorative /><div><p className="font-semibold">Dr. Pill</p><p className="text-surface/70 text-xs">{speaking || isPlaying ? "Speaking" : recording ? "Listening" : `${currentPack.name} · local demo`}</p></div></div>
              <Button variant="ghost" size="icon" className="border-surface/20 text-surface hover:bg-surface/10" aria-label="Minimize companion" onClick={() => setIsOpen(false)}><ChevronDown /></Button>
            </header>
            <div className="flex max-h-60 flex-col gap-3 overflow-y-auto p-4" aria-live="polite">
              {turns.slice(-5).map((turn) => <div key={turn.id} className={cn("flex gap-2", turn.role === "user" && "justify-end")}><p className={cn("max-w-[88%] rounded-control px-3 py-2 text-sm whitespace-pre-wrap", turn.role === "assistant" ? "bg-subtle" : "bg-mint")}>{turn.text}</p></div>)}
              {latestReply ? <button type="button" className="text-muted inline-flex min-h-11 items-center gap-2 self-start text-xs underline" onClick={() => speak(latestReply)}><Volume2 className="size-4" /> Play last reply</button> : null}
              {approval ? <div className="rounded-control bg-amber-chip text-amber-chip-ink flex items-start gap-2 p-3 text-xs"><CircleHelp className="mt-0.5 size-4 shrink-0" /><span><strong>Staff review required.</strong> {approval}. No change has been made.</span></div> : null}
            </div>
            <div className="border-line border-t p-3">
              <form onSubmit={submitMessage} className="flex items-end gap-2">
                <label className="sr-only" htmlFor="pill-demo-message">Ask a demo question</label>
                <textarea id="pill-demo-message" value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Ask about a demo workflow…" rows={2} className="rounded-control border-line-strong min-h-11 min-w-0 flex-1 resize-none border bg-white px-3 py-2 text-sm" />
                <Button type="submit" size="icon" aria-label="Send demo question" disabled={!message.trim()}><Send /></Button>
              </form>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Button variant={recording && !mediaRecorder.current ? "danger" : "ghost"} className="min-h-10 px-3 text-xs" onClick={startDictation} disabled={recording && Boolean(mediaRecorder.current)}>{recording && !mediaRecorder.current ? <MicOff /> : <Mic />}{recording && !mediaRecorder.current ? "Stop listening" : "Voice to text"}</Button>
                <Button variant={recording && mediaRecorder.current ? "danger" : "ghost"} className="min-h-10 px-3 text-xs" onClick={toggleVoiceNote} disabled={recording && !mediaRecorder.current}><AudioLines />{recording && mediaRecorder.current ? "Stop recording" : "Voice note"}</Button>
                <Button variant="ghost" className="min-h-10 px-3 text-xs" onClick={() => { const next = !voiceOn; setVoiceOn(next); if (!next && "speechSynthesis" in window) { window.speechSynthesis.cancel(); setSpeaking(false); } }} aria-pressed={voiceOn}>{voiceOn ? <VolumeX /> : <Volume2 />}{voiceOn ? "Voice replies on" : "Voice replies"}</Button>
              </div>
              {recordedUrl ? <div className="mt-2 flex items-center gap-2"><audio ref={audioRef} src={recordedUrl} onPlay={() => setIsPlaying(true)} onEnded={() => setIsPlaying(false)} controls className="h-9 min-w-0 flex-1" /><span className="sr-only">{isPlaying ? "Voice note playing" : "Voice note ready"}</span><Button variant="ghost" size="icon" aria-label="Discard voice note" onClick={() => { URL.revokeObjectURL(recordedUrl); setRecordedUrl(null); }}><VolumeX /></Button></div> : null}
              {notice ? <p role="status" className="text-muted mt-2 text-xs leading-5">{notice}</p> : null}
              <p className="text-muted mt-2 text-[11px] leading-4">Synthetic demo only. Voice notes stay in this tab; browser speech recognition may use its provider. Do not enter real patient information.</p>
            </div>
          </section>
        ) : null}
        <Button className="shadow-card rounded-full px-4" onClick={() => setIsOpen((open) => !open)} aria-expanded={isOpen} aria-label={isOpen ? "Hide Dr. Pill companion" : "Open Dr. Pill companion"}>
          {isOpen ? <ChevronUp /> : <DrPillAvatar size={24} decorative />} {isOpen ? "Hide Dr. Pill" : "Ask Dr. Pill"}
        </Button>
      </div>
    </div>
  );
}
