import { z } from "zod";

export const TONES = ["warm", "professional", "playful"] as const;
export type Tone = (typeof TONES)[number];
export const TONE_LABELS: Record<Tone, string> = {
  warm: "Warm",
  professional: "Professional",
  playful: "Playful",
};

/** Dr. Pill switches, stored in clinics.assistant_settings. Missing keys fall back to defaults. */
export const assistantSettingsSchema = z.object({
  answer_questions: z.boolean().default(true),
  book_appointments: z.boolean().default(true),
  send_reminders: z.boolean().default(true),
  share_payment_links: z.boolean().default(true),
  tone: z.enum(TONES).default("warm"),
});
export type AssistantSettings = z.infer<typeof assistantSettingsSchema>;

export const ASSISTANT_TOGGLES = [
  {
    key: "answer_questions",
    title: "Answer patient questions",
    hint: "Hours, services and directions",
  },
  { key: "book_appointments", title: "Book appointments", hint: "From your open slots" },
  { key: "send_reminders", title: "Send reminders", hint: "24 hours before each visit" },
  { key: "share_payment_links", title: "Share payment links", hint: "You approve each one" },
] as const satisfies readonly { key: keyof AssistantSettings; title: string; hint: string }[];
