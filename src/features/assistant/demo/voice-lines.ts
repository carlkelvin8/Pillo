export const DEMO_VOICE_LINES = {
  intro: "Hi! I’m your local demo companion. Choose a clinic workflow to explore. This demo uses fictional examples only.",
  schedule:
    "I can help prepare an appointment request. Choose a visit type and preferred time, then staff can confirm an available slot. No booking was made in this demo.",
  recall:
    "I can prepare a recall or cancellation-fill suggestion for staff review. A staff member must approve the message and confirm availability before anything is sent.",
  billing:
    "I can show staff how to share an invoice payment link. This demo does not open invoices, create links, or record payments.",
  intake:
    "The demo intake checklist is ready. Collect only the fields shown in the selected pack, and let clinic staff review them before saving anything.",
  handoff:
    "I can’t assess symptoms or give treatment advice. I’ll direct this to a licensed clinician or clinic staff member. If someone may be in immediate danger, contact local emergency services now.",
} as const;

export type DemoVoiceLineId = keyof typeof DEMO_VOICE_LINES;

export function getDemoVoiceLine(id: unknown): { id: DemoVoiceLineId; text: string } | null {
  if (typeof id !== "string" || !Object.hasOwn(DEMO_VOICE_LINES, id)) return null;
  const lineId = id as DemoVoiceLineId;
  return { id: lineId, text: DEMO_VOICE_LINES[lineId] };
}
