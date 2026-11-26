import { expect, it, vi } from "vitest";
import { handBackAction, resolveConversationAction, sendStaffMessageAction } from "./actions";

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

it("reports a failed takeover after the reply was stored", async () => {
  const clinicId = "a0b1c2d3-1234-4123-8123-120000000000";
  const form = new FormData();
  form.set("conversationId", "a0b1c2d3-1234-4123-8123-120000000001");
  form.set("message", "Hello");
  mock.revalidatePath.mockClear();
  mock.getWorkspace.mockResolvedValue({
    membership: { role: "receptionist", clinic: { id: clinicId } },
  });
  mock.createClient.mockResolvedValue({
    from: (table: string) => {
      if (table === "messages") return { insert: async () => ({ error: null }) };
      if (table === "conversations")
        return {
          update: () => ({ eq: () => ({ eq: async () => ({ error: { code: "XX000" } }) }) }),
        };
      throw new Error(`Unexpected table ${table}`);
    },
    rpc: async () => ({ error: null }),
  });
  const result = await sendStaffMessageAction({}, form);
  expect(result.ok).toBeUndefined();
  expect(result.message).toContain("could not take over the chat");
});

const CONVO = "a0b1c2d3-1234-4123-8123-120000000001";
const CLINIC = "a0b1c2d3-1234-4123-8123-120000000000";

function conversationClient(rows: unknown[]) {
  const update = vi.fn();
  const rpc = vi.fn().mockResolvedValue({ error: null });
  const chain = {
    eq: vi.fn(() => chain),
    select: vi.fn(async () => ({ data: rows, error: null })),
  };
  update.mockReturnValue(chain);
  mock.createClient.mockResolvedValue({ from: () => ({ update }), rpc });
  return { update, rpc };
}

it.each([
  ["hand back", handBackAction, { handled_by: "ai", status: "open" }, "conversation.handed_back"],
  ["resolve", resolveConversationAction, { status: "resolved" }, "conversation.resolved"],
] as const)(
  "%s updates the conversation and writes an audit entry",
  async (_n, action, patch, audit) => {
    mock.getWorkspace.mockResolvedValue({
      membership: { role: "receptionist", clinic: { id: CLINIC } },
    });
    const { update, rpc } = conversationClient([{ id: CONVO }]);
    const form = new FormData();
    form.set("conversationId", CONVO);
    await expect(action({}, form)).resolves.toEqual({ ok: true });
    expect(update).toHaveBeenCalledWith(patch);
    expect(rpc).toHaveBeenCalledWith(
      "log_audit",
      expect.objectContaining({ p_action: audit, p_entity_id: CONVO }),
    );
  },
);

it("refuses inbox writes for a doctor and reports a conversation that is not in the clinic", async () => {
  const form = new FormData();
  form.set("conversationId", CONVO);
  form.set("message", "hello");
  mock.getWorkspace.mockResolvedValue({ membership: { role: "doctor", clinic: { id: CLINIC } } });
  const { update } = conversationClient([]);
  for (const action of [handBackAction, resolveConversationAction, sendStaffMessageAction])
    await expect(action({}, form)).resolves.toEqual({
      message: "You do not have permission to do that.",
    });
  expect(update).not.toHaveBeenCalled();

  mock.getWorkspace.mockResolvedValue({ membership: { role: "owner", clinic: { id: CLINIC } } });
  conversationClient([]);
  await expect(resolveConversationAction({}, form)).resolves.toEqual({
    message: "We could not update that conversation.",
  });
  const bad = new FormData();
  bad.set("conversationId", "not-a-uuid");
  await expect(resolveConversationAction({}, bad)).resolves.toEqual({
    message: "Invalid conversation.",
  });
});

it("rejects an empty or oversized staff reply before touching the database", async () => {
  mock.getWorkspace.mockResolvedValue({ membership: { role: "owner", clinic: { id: CLINIC } } });
  mock.createClient.mockClear();
  for (const message of ["   ", "x".repeat(1001)]) {
    const form = new FormData();
    form.set("conversationId", CONVO);
    form.set("message", message);
    const result = await sendStaffMessageAction({}, form);
    expect(result.fieldErrors?.message?.length).toBeGreaterThan(0);
  }
  expect(mock.createClient).not.toHaveBeenCalled();
});
