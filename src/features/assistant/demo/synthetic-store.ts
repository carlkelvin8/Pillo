import { assistantSettingsSchema } from "@/features/assistant/settings";
import type { AgentStore, ClinicInfo } from "@/features/assistant/agent/store";

export class SyntheticStore implements AgentStore {
  readonly clinic: ClinicInfo = {
    id: "demo-clinic",
    name: "Demo Family Dental",
    timezone: "Asia/Manila",
    address: "123 Sampaguita Street, Quezon City",
    phone: "+63 2 8123 4567",
    settings: assistantSettingsSchema.parse({ book_appointments: false }),
  };
  readonly conversationId = "synthetic-demo-conversation";

  async listBranches() {
    return [
      {
        id: "demo-branch-main",
        name: "Main Branch",
        address: "123 Sampaguita Street, Quezon City",
        phone: "+63 2 8123 4567",
        hours: [1, 2, 3, 4, 5].map((weekday) => ({ weekday, start: "09:00", end: "17:00" })),
      },
    ];
  }
  async listDoctors() {
    return [{ id: "demo-doctor-1", name: "Dr. Alex Reyes", specialty: "General dentistry" }];
  }
  async slotContext() {
    return { branchHours: [], doctorHours: [], booked: [] };
  }
  async findOrCreatePatient(): Promise<{ id: string }> {
    throw new Error("Patient creation is disabled in the synthetic demo.");
  }
  async linkPatient() {
    throw new Error("Patient linking is disabled in the synthetic demo.");
  }
  async createAppointment() {
    return { ok: false as const, reason: "error" as const };
  }
  async moveAppointment() {
    return { ok: false as const, reason: "error" as const };
  }
  async getConversationAppointment() {
    return null;
  }
  async actionsToday() {
    return 0;
  }
  async record() {}
  async rule() {
    return { autonomy: "suggest" as const, dailyLimit: 0 };
  }
  async handoff() {}
}
