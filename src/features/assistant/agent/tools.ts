import { z } from "zod";
import type { ModelTool } from "./model";
import type { AssistantSettings } from "@/features/assistant/settings";
import { dateStringSchema } from "@/features/scheduling/schemas";
import { generateSlots, isOpenSlot } from "@/features/scheduling/slots";
import {
  addDays,
  dateOf,
  formatDateLong,
  formatTime,
  formatWeekday,
  hhmm,
  todayIn,
} from "@/lib/datetime";
import type { AgentStore, HandoffReason } from "./store";

export type ToolContext = { store: AgentStore; now: Date };
export type ToolResult = { content: string; isError: boolean; handedOff?: boolean };

const ok = (data: unknown, handedOff = false): ToolResult => ({
  content: JSON.stringify(data),
  isError: false,
  handedOff,
});
const fail = (message: string): ToolResult => ({
  content: JSON.stringify({ error: message }),
  isError: true,
});

const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** "Wed 25 November, 10:00 AM" in clinic time. */
export function slotLabel(iso: string, tz: string): string {
  const d = dateOf(iso, tz);
  return `${formatWeekday(d)} ${formatDateLong(d)}, ${formatTime(iso, tz)}`;
}

/* ------------------------------ definitions ------------------------------ */

export function toolDefinitions(settings: AssistantSettings): ModelTool[] {
  const tools: ModelTool[] = [];
  if (settings.answer_questions) {
    tools.push({
      name: "get_clinic_info",
      description:
        "Get the clinic's name, address, phone, branches with opening hours, and doctors with ids. Call this before answering questions about hours, location, doctors or branches.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    });
  }
  if (settings.book_appointments) {
    tools.push(
      {
        name: "list_open_slots",
        description:
          "List real open appointment times for a date (clinic time). Omit doctor_id to see up to 4 doctors. Omit branch_id for the main branch.",
        parameters: {
          type: "object",
          properties: {
            date: { type: "string", description: "YYYY-MM-DD, today or up to 60 days ahead" },
            doctor_id: { type: "string", description: "Doctor id from get_clinic_info" },
            branch_id: { type: "string", description: "Branch id from get_clinic_info" },
            duration_min: { type: "integer", description: "Minutes, 15 to 120. Default 30." },
          },
          required: ["date"],
          additionalProperties: false,
        },
      },
      {
        name: "book_appointment",
        description:
          "Book an appointment the patient has chosen from list_open_slots. Only call after the patient picked a time AND clearly agreed to let the clinic save their name and number (consent_confirmed).",
        parameters: {
          type: "object",
          properties: {
            patient_name: { type: "string", description: "Patient's full name" },
            phone: { type: "string", description: "Patient's mobile number" },
            doctor_id: { type: "string" },
            branch_id: { type: "string" },
            starts_at: {
              type: "string",
              description: "The exact starts_at value from list_open_slots",
            },
            duration_min: {
              type: "integer",
              description: "Same duration used for list_open_slots. Default 30.",
            },
            reason: {
              type: "string",
              description:
                "Short reason for the visit, if the patient gave one. Not medical details.",
            },
            consent_confirmed: {
              type: "boolean",
              description: "True only after the patient clearly said yes to saving their details",
            },
          },
          required: [
            "patient_name",
            "phone",
            "doctor_id",
            "branch_id",
            "starts_at",
            "consent_confirmed",
          ],
          additionalProperties: false,
        },
      },
      {
        name: "reschedule_appointment",
        description:
          "Move an appointment that YOU booked earlier in this same conversation to another open time. Cannot touch any other appointment.",
        parameters: {
          type: "object",
          properties: {
            appointment_id: { type: "string", description: "The id returned by book_appointment" },
            new_starts_at: {
              type: "string",
              description: "A starts_at value from list_open_slots",
            },
          },
          required: ["appointment_id", "new_starts_at"],
          additionalProperties: false,
        },
      },
    );
  }
  tools.push({
    name: "request_human",
    description:
      "Hand the conversation to a staff member. Use for ANY medical question, refund or billing dispute, upset patient, request to change or cancel existing appointments, or anything you cannot answer from tools.",
    parameters: {
      type: "object",
      properties: {
        reason: {
          type: "string",
          enum: ["medical", "refund", "upset", "requested", "booking", "other"],
        },
        summary: {
          type: "string",
          description:
            "One or two sentences for the staff: what the patient needs. Do not include medical advice.",
        },
      },
      required: ["reason", "summary"],
      additionalProperties: false,
    },
  });
  return tools;
}

/* ------------------------------- schemas -------------------------------- */

const idSchema = z.uuid();
const instant = z.iso.datetime();
const phoneSchema = z
  .string()
  .trim()
  .transform((v) => v.replace(/[\s().-]/g, ""))
  .refine((v) => /^\+?\d{7,15}$/.test(v), "invalid phone number");

const listSchema = z.object({
  date: dateStringSchema,
  doctor_id: idSchema.optional(),
  branch_id: idSchema.optional(),
  duration_min: z.number().int().min(15).max(120).optional(),
});
const bookSchema = z.object({
  patient_name: z.string().trim().min(2).max(120),
  phone: phoneSchema,
  doctor_id: idSchema,
  branch_id: idSchema,
  starts_at: instant,
  duration_min: z.number().int().min(15).max(120).optional(),
  reason: z.string().trim().max(200).optional(),
  consent_confirmed: z.boolean(),
});
const rescheduleSchema = z.object({ appointment_id: idSchema, new_starts_at: instant });
const humanSchema = z.object({
  reason: z.enum(["medical", "refund", "upset", "requested", "booking", "other"]),
  summary: z.string().trim().min(1).max(400),
});

/* ------------------------------- handlers -------------------------------- */

async function getClinicInfo({ store }: ToolContext): Promise<ToolResult> {
  const [branches, doctors] = await Promise.all([store.listBranches(), store.listDoctors()]);
  const c = store.clinic;
  return ok({
    clinic: c.name,
    address: c.address,
    phone: c.phone,
    timezone: c.timezone,
    branches: branches.map((b) => ({
      id: b.id,
      name: b.name,
      address: b.address,
      phone: b.phone,
      opening_hours: [1, 2, 3, 4, 5, 6, 0]
        .map((wd) => {
          const w = b.hours.filter((h) => h.weekday === wd);
          return `${WEEKDAY[wd]}: ${w.length ? w.map((x) => `${hhmm(x.start)}-${hhmm(x.end)}`).join(", ") : "closed"}`;
        })
        .join("; "),
    })),
    doctors: doctors.map((d) => ({ id: d.id, name: d.name, specialty: d.specialty })),
  });
}

async function listOpenSlots(ctx: ToolContext, raw: unknown): Promise<ToolResult> {
  const input = listSchema.safeParse(raw);
  if (!input.success) return fail("Invalid input. Provide date as YYYY-MM-DD and valid ids.");
  const { store, now } = ctx;
  const tz = store.clinic.timezone;
  const today = todayIn(tz, now);
  const { date } = input.data;
  if (date < today || date > addDays(today, 60))
    return fail("Date must be today or within the next 60 days.");

  const [branches, doctors] = await Promise.all([store.listBranches(), store.listDoctors()]);
  const branch = input.data.branch_id
    ? branches.find((b) => b.id === input.data.branch_id)
    : branches[0];
  if (!branch) return fail("Unknown branch.");
  const chosen = input.data.doctor_id
    ? doctors.filter((d) => d.id === input.data.doctor_id)
    : doctors.slice(0, 4);
  if (chosen.length === 0) return fail("Unknown doctor.");

  const results = [];
  for (const d of chosen) {
    const sc = await store.slotContext({ branchId: branch.id, doctorId: d.id, date });
    const slots = generateSlots({
      date,
      tz,
      durationMin: input.data.duration_min ?? 30,
      now,
      ...sc,
    }).slice(0, 6);
    results.push({
      doctor_id: d.id,
      doctor: d.name,
      slots: slots.map((s) => ({ starts_at: s, label: slotLabel(s, tz) })),
    });
  }
  if (results.every((r) => r.slots.length === 0)) {
    return ok({
      branch: { id: branch.id, name: branch.name },
      results,
      note: "No open times on this date. Suggest another date.",
    });
  }
  return ok({ branch: { id: branch.id, name: branch.name }, results });
}

async function bookAppointment(ctx: ToolContext, raw: unknown): Promise<ToolResult> {
  const input = bookSchema.safeParse(raw);
  if (!input.success) return fail("Invalid input. Check the name, mobile number, ids and time.");
  const v = input.data;
  const { store, now } = ctx;
  const tz = store.clinic.timezone;
  if (!v.consent_confirmed)
    return fail(
      "Ask the patient to agree to saving their name and number first, then call again with consent_confirmed true.",
    );

  const [branches, doctors, rule] = await Promise.all([
    store.listBranches(),
    store.listDoctors(),
    store.rule("book_appointment"),
  ]);
  const branch = branches.find((b) => b.id === v.branch_id);
  const doctor = doctors.find((d) => d.id === v.doctor_id);
  if (!branch || !doctor) return fail("Unknown branch or doctor.");
  const duration = v.duration_min ?? 30;
  const label = slotLabel(v.starts_at, tz);
  const payload = { doctor_id: doctor.id, branch_id: branch.id, starts_at: v.starts_at };

  // The clinic may want a human to finish every booking, or may have hit today's limit.
  if (rule.autonomy !== "auto") {
    await store.record({
      kind: "book_appointment",
      status: "proposed",
      autonomy: rule.autonomy,
      payload,
      outcome: "sent to staff",
    });
    await store.handoff(
      "booking",
      `Wants to book ${doctor.name} at ${branch.name}, ${label}. Name: ${v.patient_name}. Mobile: ${v.phone}. Consent to save details: yes.`,
    );
    return ok(
      {
        status: "sent_to_staff",
        message: "Tell the patient a staff member will confirm the booking shortly.",
      },
      true,
    );
  }
  if ((await store.actionsToday("book_appointment")) >= rule.dailyLimit) {
    await store.handoff(
      "booking",
      `Daily booking limit reached. Wants ${doctor.name} at ${branch.name}, ${label}. Name: ${v.patient_name}. Mobile: ${v.phone}.`,
    );
    return ok(
      {
        status: "sent_to_staff",
        message: "Tell the patient a staff member will confirm the booking shortly.",
      },
      true,
    );
  }

  const date = dateOf(v.starts_at, tz);
  const sc = await store.slotContext({ branchId: branch.id, doctorId: doctor.id, date });
  if (!isOpenSlot({ date, tz, durationMin: duration, now, ...sc }, v.starts_at)) {
    return fail("That time is not available. Call list_open_slots again and offer other times.");
  }

  const patient = await store.findOrCreatePatient({
    fullName: v.patient_name,
    phone: v.phone,
    consent: true,
  });
  await store.linkPatient(patient.id);
  const endsAt = new Date(new Date(v.starts_at).getTime() + duration * 60_000).toISOString();
  const created = await store.createAppointment({
    branchId: branch.id,
    patientId: patient.id,
    doctorId: doctor.id,
    startsAt: v.starts_at,
    endsAt,
    reason: v.reason,
  });
  if (!created.ok) {
    await store.record({
      kind: "book_appointment",
      status: "failed",
      autonomy: "auto",
      payload,
      outcome: created.reason,
    });
    return fail(
      created.reason === "conflict"
        ? "That time was just taken. Call list_open_slots again."
        : "Could not book. Offer to hand over to staff.",
    );
  }
  await store.record({
    kind: "book_appointment",
    status: "executed",
    autonomy: "auto",
    payload: { ...payload, appointment_id: created.id },
    outcome: "booked",
  });
  return ok({
    status: "booked",
    appointment_id: created.id,
    doctor: doctor.name,
    branch: branch.name,
    when: label,
  });
}

async function rescheduleAppointment(ctx: ToolContext, raw: unknown): Promise<ToolResult> {
  const input = rescheduleSchema.safeParse(raw);
  if (!input.success) return fail("Invalid input.");
  const { store, now } = ctx;
  const tz = store.clinic.timezone;
  const appt = await store.getConversationAppointment(input.data.appointment_id);
  if (!appt)
    return fail(
      "You can only reschedule an appointment you booked in this conversation. Hand over to staff with request_human.",
    );
  if (appt.status !== "scheduled" && appt.status !== "confirmed")
    return fail("That appointment can no longer be moved.");

  const duration = Math.round(
    (new Date(appt.endsAt).getTime() - new Date(appt.startsAt).getTime()) / 60_000,
  );
  const date = dateOf(input.data.new_starts_at, tz);
  const sc = await store.slotContext({
    branchId: appt.branchId,
    doctorId: appt.doctorId,
    date,
    excludeAppointmentId: appt.id,
  });
  if (!isOpenSlot({ date, tz, durationMin: duration, now, ...sc }, input.data.new_starts_at)) {
    return fail("That time is not available. Call list_open_slots again.");
  }
  const endsAt = new Date(
    new Date(input.data.new_starts_at).getTime() + duration * 60_000,
  ).toISOString();
  const moved = await store.moveAppointment({
    id: appt.id,
    startsAt: input.data.new_starts_at,
    endsAt,
  });
  if (!moved.ok)
    return fail(
      moved.reason === "conflict"
        ? "That time was just taken."
        : "Could not move it. Offer to hand over to staff.",
    );
  await store.record({
    kind: "reschedule_appointment",
    status: "executed",
    autonomy: "auto",
    payload: { appointment_id: appt.id, starts_at: input.data.new_starts_at },
    outcome: "moved",
  });
  return ok({ status: "rescheduled", when: slotLabel(input.data.new_starts_at, tz) });
}

async function requestHuman({ store }: ToolContext, raw: unknown): Promise<ToolResult> {
  const input = humanSchema.safeParse(raw);
  if (!input.success) return fail("Provide a reason and a short summary.");
  const reason: HandoffReason = input.data.reason;
  await store.handoff(reason, input.data.summary);
  await store.record({
    kind: "handoff",
    status: "executed",
    autonomy: "auto",
    payload: { reason },
    outcome: "handed to staff",
  });
  return ok(
    {
      status: "handed_off",
      message: "A staff member has been notified. Write one short kind message and stop.",
    },
    true,
  );
}

/** Runs one tool call. Unknown tools and unexpected errors become tool errors, never exceptions. */
export async function executeTool(
  name: string,
  input: unknown,
  ctx: ToolContext,
): Promise<ToolResult> {
  const s = ctx.store.clinic.settings;
  try {
    switch (name) {
      case "get_clinic_info":
        return s.answer_questions ? await getClinicInfo(ctx) : fail("Not available.");
      case "list_open_slots":
        return s.book_appointments ? await listOpenSlots(ctx, input) : fail("Not available.");
      case "book_appointment":
        return s.book_appointments ? await bookAppointment(ctx, input) : fail("Not available.");
      case "reschedule_appointment":
        return s.book_appointments
          ? await rescheduleAppointment(ctx, input)
          : fail("Not available.");
      case "request_human":
        return await requestHuman(ctx, input);
      default:
        return fail("Unknown tool.");
    }
  } catch {
    return fail("Temporary problem. Offer to hand over to staff with request_human.");
  }
}
