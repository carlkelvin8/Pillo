import type { AssistantSettings } from "@/features/assistant/settings";
import type { BusyRange, HourWindow } from "@/features/scheduling/slots";

export type ClinicInfo = {
  id: string;
  name: string;
  timezone: string;
  address: string | null;
  phone: string | null;
  settings: AssistantSettings;
};
export type BranchInfo = {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  hours: HourWindow[];
};
export type DoctorInfo = { id: string; name: string; specialty: string | null };
export type Rule = { autonomy: "suggest" | "approve" | "auto"; dailyLimit: number };
export type HandoffReason = "medical" | "refund" | "upset" | "requested" | "booking" | "other";
export type ActionKind = "book_appointment" | "reschedule_appointment" | "handoff" | "reply";

export type ConversationAppointment = {
  id: string;
  branchId: string;
  doctorId: string;
  startsAt: string;
  endsAt: string;
  status: string;
};

/**
 * Everything the agent may touch, already scoped to ONE clinic and ONE conversation. The model never
 * supplies a clinic id: it is fixed when the store is created, so a tool call cannot cross tenants.
 */
export interface AgentStore {
  readonly clinic: ClinicInfo;
  readonly conversationId: string;
  listBranches(): Promise<BranchInfo[]>;
  listDoctors(): Promise<DoctorInfo[]>;
  slotContext(args: {
    branchId: string;
    doctorId: string;
    date: string;
    excludeAppointmentId?: string;
  }): Promise<{ branchHours: HourWindow[]; doctorHours: HourWindow[]; booked: BusyRange[] }>;
  findOrCreatePatient(args: {
    fullName: string;
    phone: string;
    consent: boolean;
  }): Promise<{ id: string }>;
  linkPatient(patientId: string): Promise<void>;
  createAppointment(args: {
    branchId: string;
    patientId: string;
    doctorId: string;
    startsAt: string;
    endsAt: string;
    reason?: string;
  }): Promise<{ ok: true; id: string } | { ok: false; reason: "conflict" | "error" }>;
  moveAppointment(args: {
    id: string;
    startsAt: string;
    endsAt: string;
  }): Promise<{ ok: true } | { ok: false; reason: "conflict" | "error" }>;
  /** Only appointments this agent booked in THIS conversation. */
  getConversationAppointment(id: string): Promise<ConversationAppointment | null>;
  actionsToday(kind: ActionKind): Promise<number>;
  record(action: {
    kind: ActionKind;
    status: "proposed" | "executed" | "failed";
    autonomy: Rule["autonomy"];
    payload: Record<string, string | number | boolean>;
    outcome?: string;
  }): Promise<void>;
  rule(kind: "reply" | "book_appointment"): Promise<Rule>;
  handoff(reason: HandoffReason, summary: string): Promise<void>;
}
