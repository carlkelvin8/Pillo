import { expect, it, vi } from "vitest";
import { sendStaffMessageAction } from "./actions";

const mock = vi.hoisted(() => ({
  getWorkspace: vi.fn(),
  createClient: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mock.revalidatePath }));
vi.mock("@/features/auth/workspace", () => ({ getWorkspace: mock.getWorkspace }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mock.createClient }));
vi.mock("@/features/invoices/actions", () => ({ requestPaymentAction: vi.fn() }));

it("waits for the reply to persist, then starts the status update and audit together", async () => {
  const clinicId = "a0b1c2d3-1234-4123-8123-120000000000";
  const conversationId = "a0b1c2d3-1234-4123-8123-120000000001";
  const form = new FormData();
  form.set("conversationId", conversationId);
  form.set("message", "  We can see you tomorrow.  ");

  const insert = Promise.withResolvers<{ error: null }>();
  const status = Promise.withResolvers<{ error: null }>();
  const audit = Promise.withResolvers<{ error: null }>();
  const writeReply = vi.fn(() => insert.promise);
  const byClinic = vi.fn(() => status.promise);
  const byConversation = vi.fn(() => ({ eq: byClinic }));
  const updateStatus = vi.fn(() => ({ eq: byConversation }));
  const writeAudit = vi.fn(() => audit.promise);
  mock.getWorkspace.mockResolvedValue({
    membership: { role: "receptionist", clinic: { id: clinicId } },
  });
  mock.createClient.mockResolvedValue({
    from: (table: string) => {
      if (table === "messages") return { insert: writeReply };
      if (table === "conversations") return { update: updateStatus };
      throw new Error(`Unexpected table ${table}`);
    },
    rpc: writeAudit,
  });

  const send = sendStaffMessageAction({}, form);
  try {
    await vi.waitFor(() =>
      expect(writeReply).toHaveBeenCalledExactlyOnceWith({
        clinic_id: clinicId,
        conversation_id: conversationId,
        role: "staff",
        handled_by: "human",
        content: "We can see you tomorrow.",
      }),
    );
    expect(updateStatus).not.toHaveBeenCalled();
    expect(writeAudit).not.toHaveBeenCalled();

    insert.resolve({ error: null });
    await vi.waitFor(
      () => {
        expect(updateStatus).toHaveBeenCalledExactlyOnceWith({
          status: "open",
          handled_by: "human",
        });
        expect(writeAudit).toHaveBeenCalledExactlyOnceWith("log_audit", {
          p_clinic_id: clinicId,
          p_action: "conversation.replied",
          p_entity: "conversation",
          p_entity_id: conversationId,
          p_meta: {},
        });
      },
      { timeout: 300 },
    );
    expect(byConversation).toHaveBeenCalledExactlyOnceWith("id", conversationId);
    expect(byClinic).toHaveBeenCalledExactlyOnceWith("clinic_id", clinicId);

    status.resolve({ error: null });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mock.revalidatePath).not.toHaveBeenCalled();
  } finally {
    insert.resolve({ error: null });
    status.resolve({ error: null });
    audit.resolve({ error: null });
  }
  await expect(send).resolves.toEqual({ ok: true });
  expect(mock.revalidatePath).toHaveBeenCalledExactlyOnceWith("/dr-pill");
});
