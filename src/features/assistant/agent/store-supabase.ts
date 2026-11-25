import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { loadSlotContext } from "@/features/scheduling/queries";
import type { HourWindow } from "@/features/scheduling/slots";
import { dayBoundsUtc, todayIn } from "@/lib/datetime";
import type {
  ActionKind,
  AgentStore,
  BranchInfo,
  ClinicInfo,
  ConversationAppointment,
  DoctorInfo,
  HandoffReason,
  Rule,
} from "./store";

const DEFAULT_RULES: Record<"reply" | "book_appointment", Rule> = {
  reply: { autonomy: "auto", dailyLimit: 300 },
  book_appointment: { autonomy: "auto", dailyLimit: 30 },
};

const OVERLAP = "23P01";

/**
 * AgentStore backed by the service-role client. It bypasses Row Level Security, so EVERY query below
 * filters by the clinic id fixed at construction. Nothing here takes a clinic id from the model.
 */
export function createSupabaseAgentStore(
  svc: SupabaseClient,
  clinic: ClinicInfo,
  conversationId: string,
): AgentStore {
  const clinicId = clinic.id;
  const tz = clinic.timezone;

  const audit = async (action: string, entity: string, entityId: string | null) => {
    await svc.from("audit_log").insert({
      clinic_id: clinicId,
      actor_type: "ai",
      action,
      entity,
      entity_id: entityId,
      meta: { via: "dr_pill" },
    });
  };

  return {
    clinic,
    conversationId,

    async listBranches(): Promise<BranchInfo[]> {
      const [b, h] = await Promise.all([
        svc
          .from("branches")
          .select("id, name, address, phone")
          .eq("clinic_id", clinicId)
          .order("created_at", { ascending: true }),
        svc
          .from("clinic_hours")
          .select("branch_id, weekday, opens_at, closes_at")
          .eq("clinic_id", clinicId),
      ]);
      const branches = z
        .array(
          z.object({
            id: z.string(),
            name: z.string(),
            address: z.string().nullable(),
            phone: z.string().nullable(),
          }),
        )
        .parse(b.data ?? []);
      const hours = z
        .array(
          z.object({
            branch_id: z.string(),
            weekday: z.number(),
            opens_at: z.string(),
            closes_at: z.string(),
          }),
        )
        .parse(h.data ?? []);
      return branches.map((x) => ({
        ...x,
        hours: hours
          .filter((r) => r.branch_id === x.id)
          .map((r): HourWindow => ({ weekday: r.weekday, start: r.opens_at, end: r.closes_at })),
      }));
    },

    async listDoctors(): Promise<DoctorInfo[]> {
      const { data } = await svc
        .from("doctors")
        .select("id, display_name, specialty")
        .eq("clinic_id", clinicId)
        .eq("active", true)
        .order("display_name");
      return z
        .array(
          z.object({ id: z.string(), display_name: z.string(), specialty: z.string().nullable() }),
        )
        .parse(data ?? [])
        .map((d) => ({ id: d.id, name: d.display_name, specialty: d.specialty }));
    },

    slotContext: (a) =>
      loadSlotContext(svc, {
        clinicId,
        branchId: a.branchId,
        doctorId: a.doctorId,
        date: a.date,
        tz,
        excludeAppointmentId: a.excludeAppointmentId,
      }),

    async findOrCreatePatient({ fullName, phone, consent }) {
      const { data: existing } = await svc
        .from("patients")
        .select("id, consent_at")
        .eq("clinic_id", clinicId)
        .eq("phone", phone)
        .ilike("full_name", fullName)
        .limit(1);
      const row = z
        .array(z.object({ id: z.string(), consent_at: z.string().nullable() }))
        .parse(existing ?? [])[0];
      if (row) {
        if (consent && !row.consent_at)
          await svc
            .from("patients")
            .update({ consent_at: new Date().toISOString() })
            .eq("id", row.id)
            .eq("clinic_id", clinicId);
        return { id: row.id };
      }
      const { data, error } = await svc
        .from("patients")
        .insert({
          clinic_id: clinicId,
          full_name: fullName,
          phone,
          consent_at: consent ? new Date().toISOString() : null,
        })
        .select("id")
        .single();
      if (error || !data) throw new Error("patient insert failed");
      const id = String((data as { id: unknown }).id);
      await audit("patient.created", "patient", id);
      return { id };
    },

    async linkPatient(patientId) {
      await svc
        .from("conversations")
        .update({ patient_id: patientId })
        .eq("id", conversationId)
        .eq("clinic_id", clinicId);
    },

    async createAppointment(a) {
      const { data, error } = await svc
        .from("appointments")
        .insert({
          clinic_id: clinicId,
          branch_id: a.branchId,
          patient_id: a.patientId,
          doctor_id: a.doctorId,
          starts_at: a.startsAt,
          ends_at: a.endsAt,
          reason: a.reason ?? null,
          status: "scheduled",
          source: "ai",
          send_reminder: true,
        })
        .select("id")
        .single();
      if (error?.code === OVERLAP) return { ok: false, reason: "conflict" };
      if (error || !data) return { ok: false, reason: "error" };
      const id = String((data as { id: unknown }).id);
      await audit("appointment.created", "appointment", id);
      return { ok: true, id };
    },

    async moveAppointment(a) {
      const { data, error } = await svc
        .from("appointments")
        .update({ starts_at: a.startsAt, ends_at: a.endsAt })
        .eq("id", a.id)
        .eq("clinic_id", clinicId)
        .select("id");
      if (error?.code === OVERLAP) return { ok: false, reason: "conflict" };
      if (error || !data?.length) return { ok: false, reason: "error" };
      await audit("appointment.rescheduled", "appointment", a.id);
      return { ok: true };
    },

    async getConversationAppointment(id): Promise<ConversationAppointment | null> {
      // Only appointments this agent booked in THIS conversation count.
      const { data: acts } = await svc
        .from("agent_actions")
        .select("id")
        .eq("clinic_id", clinicId)
        .eq("conversation_id", conversationId)
        .eq("kind", "book_appointment")
        .eq("status", "executed")
        .eq("payload->>appointment_id", id)
        .limit(1);
      if (!acts?.length) return null;
      const { data } = await svc
        .from("appointments")
        .select("id, branch_id, doctor_id, starts_at, ends_at, status")
        .eq("clinic_id", clinicId)
        .eq("id", id)
        .maybeSingle();
      const r = z
        .object({
          id: z.string(),
          branch_id: z.string(),
          doctor_id: z.string(),
          starts_at: z.string(),
          ends_at: z.string(),
          status: z.string(),
        })
        .nullable()
        .parse(data ?? null);
      return r
        ? {
            id: r.id,
            branchId: r.branch_id,
            doctorId: r.doctor_id,
            startsAt: r.starts_at,
            endsAt: r.ends_at,
            status: r.status,
          }
        : null;
    },

    async actionsToday(kind: ActionKind) {
      const { start } = dayBoundsUtc(todayIn(tz), tz);
      const { count } = await svc
        .from("agent_actions")
        .select("id", { count: "exact", head: true })
        .eq("clinic_id", clinicId)
        .eq("kind", kind)
        .in("status", ["executed", "proposed"])
        .gte("created_at", start);
      return count ?? 0;
    },

    async record(a) {
      await svc.from("agent_actions").insert({
        clinic_id: clinicId,
        conversation_id: conversationId,
        kind: a.kind,
        status: a.status,
        autonomy: a.autonomy,
        payload: a.payload,
        outcome: a.outcome ?? null,
      });
    },

    async rule(kind) {
      const { data } = await svc
        .from("agent_rules")
        .select("autonomy, daily_limit")
        .eq("clinic_id", clinicId)
        .eq("kind", kind)
        .maybeSingle();
      const r = z
        .object({ autonomy: z.enum(["suggest", "approve", "auto"]), daily_limit: z.number() })
        .nullable()
        .parse(data ?? null);
      return r ? { autonomy: r.autonomy, dailyLimit: r.daily_limit } : DEFAULT_RULES[kind];
    },

    async handoff(reason: HandoffReason, summary: string) {
      await svc
        .from("conversations")
        .update({
          status: "needs_human",
          handled_by: "human",
          handoff_reason: reason,
          handoff_summary: summary.slice(0, 500),
        })
        .eq("id", conversationId)
        .eq("clinic_id", clinicId);
      await audit("conversation.handoff", "conversation", conversationId);
    },
  };
}
