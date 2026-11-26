import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import type { ActionState } from "@/lib/action-state";
import { ReplyThread } from "./inbox-controls";

const sendStaffMessage = vi.hoisted(() => vi.fn());

vi.mock("@/features/assistant/actions", () => ({
  sendStaffMessageAction: sendStaffMessage,
  handBackAction: vi.fn(),
  resolveConversationAction: vi.fn(),
}));

it("shows a pending staff reply immediately and restores the draft if the send fails", async () => {
  const send = Promise.withResolvers<ActionState>();
  sendStaffMessage.mockReturnValueOnce(send.promise);
  render(
    <ReplyThread conversationId="conversation-1" messageCount={1} canReply>
      <li>Can I book tomorrow?</li>
    </ReplyThread>,
  );

  const reply = "We can see you tomorrow.";
  const draft = screen.getByRole("textbox", { name: "Reply to the patient" });
  fireEvent.change(draft, { target: { value: reply } });
  fireEvent.click(screen.getByRole("button", { name: "Send reply" }));

  const messages = within(screen.getByRole("list", { name: "Messages" }));
  expect(messages.getByText(reply)).toBeInTheDocument();
  expect(messages.getByText("Can I book tomorrow?")).toBeInTheDocument();
  const pendingButton = screen.getByRole("button", { name: "Sending…" });
  expect(pendingButton).toBeDisabled();
  fireEvent.click(pendingButton);
  expect(sendStaffMessage).toHaveBeenCalledOnce();

  await act(async () => {
    send.resolve({ message: "We could not send that reply.", values: { message: reply } });
  });

  expect(messages.queryByText(reply)).not.toBeInTheDocument();
  expect(screen.getByRole("alert")).toHaveTextContent("We could not send that reply.");
  expect(draft).toHaveValue(reply);
});

it("shows a single reply when the saved thread replaces the pending reply", async () => {
  const send = Promise.withResolvers<ActionState>();
  sendStaffMessage.mockReturnValueOnce(send.promise);
  const { rerender } = render(
    <ReplyThread conversationId="conversation-1" messageCount={0} canReply>
      {null}
    </ReplyThread>,
  );

  const reply = "We can see you tomorrow.";
  const draft = screen.getByRole("textbox", { name: "Reply to the patient" });
  fireEvent.change(draft, { target: { value: reply } });
  fireEvent.click(screen.getByRole("button", { name: "Send reply" }));
  const messages = within(screen.getByRole("list", { name: "Messages" }));
  expect(messages.getByRole("status")).toHaveTextContent("Sending…");

  await act(async () => {
    send.resolve({ ok: true });
    rerender(
      <ReplyThread conversationId="conversation-1" messageCount={1} canReply>
        <li>{reply}</li>
      </ReplyThread>,
    );
  });

  expect(messages.getAllByText(reply)).toHaveLength(1);
  expect(messages.queryByRole("status")).not.toBeInTheDocument();
  expect(draft).toHaveValue("");
});
