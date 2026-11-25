"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState, type ReactNode } from "react";
import { FormMessage } from "@/components/ui/form-message";
import { SubmitButton } from "@/components/ui/submit-button";
import {
  handBackAction,
  resolveConversationAction,
  sendStaffMessageAction,
} from "@/features/assistant/actions";
import type { ActionState } from "@/lib/action-state";
import { MessageThread } from "./message-thread";

/** Refreshes the server-rendered inbox every few seconds while the tab is visible. */
export function AutoRefresh({ everyMs = 5000 }: { everyMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, everyMs);
    return () => clearInterval(t);
  }, [router, everyMs]);
  return null;
}

export function ReplyThread({
  conversationId,
  messageCount,
  canReply,
  children,
}: {
  conversationId: string;
  messageCount: number;
  canReply: boolean;
  children: ReactNode;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    sendStaffMessageAction,
    {},
  );
  const [submittedText, setSubmittedText] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);
  const pendingReply = pending ? submittedText : "";
  useEffect(() => {
    if (state.ok && ref.current) ref.current.value = "";
  }, [state]);
  return (
    <>
      <MessageThread messageCount={messageCount + Number(Boolean(pendingReply))}>
        <ol aria-label="Messages" className="flex flex-col gap-4">
          {children}
          {pendingReply ? (
            <li className="flex flex-col items-end gap-1">
              <span className="text-muted text-xs" role="status">
                Staff · Sending…
              </span>
              <p className="rounded-card shadow-card bg-ink text-surface max-w-[min(88%,44rem)] px-4 py-3 text-sm leading-6 whitespace-pre-line">
                {pendingReply}
              </p>
            </li>
          ) : null}
        </ol>
      </MessageThread>
      {canReply ? (
        <form
          action={action}
          onSubmit={() => setSubmittedText(ref.current?.value.trim() ?? "")}
          className="border-line flex flex-col gap-2 border-t pt-4"
        >
          <FormMessage state={state} />
          <input type="hidden" name="conversationId" value={conversationId} />
          <label className="sr-only" htmlFor="staff-reply">
            Reply to the patient
          </label>
          <textarea
            id="staff-reply"
            ref={ref}
            name="message"
            rows={2}
            maxLength={1000}
            required
            readOnly={pending}
            defaultValue={state.values?.message}
            placeholder="Type a reply. The patient sees it in their chat."
            className="rounded-control border-line-strong bg-surface placeholder:text-muted min-h-11 w-full border px-4 py-2.5 text-sm"
          />
          <div className="flex justify-end">
            <SubmitButton pendingLabel="Sending…">Send reply</SubmitButton>
          </div>
        </form>
      ) : (
        <p className="text-muted text-sm">
          Resolved. If the patient writes again, Dr. Pill picks the chat back up.
        </p>
      )}
    </>
  );
}

function OneButton({
  action,
  conversationId,
  label,
  pending,
  variant,
}: {
  action: (p: ActionState, f: FormData) => Promise<ActionState>;
  conversationId: string;
  label: string;
  pending: string;
  variant: "ghost" | "mint";
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(action, {});
  return (
    <form action={formAction}>
      <input type="hidden" name="conversationId" value={conversationId} />
      <SubmitButton variant={variant} pendingLabel={pending}>
        {label}
      </SubmitButton>
      {state.message && !state.ok ? <FormMessage state={state} /> : null}
    </form>
  );
}

export function ConversationControls({
  conversationId,
  handledBy,
  status,
}: {
  conversationId: string;
  handledBy: "ai" | "human";
  status: "open" | "needs_human" | "resolved";
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {handledBy === "human" && status !== "resolved" ? (
        <OneButton
          action={handBackAction}
          conversationId={conversationId}
          label="Hand back to Dr. Pill"
          pending="Handing back…"
          variant="ghost"
        />
      ) : null}
      {status !== "resolved" ? (
        <OneButton
          action={resolveConversationAction}
          conversationId={conversationId}
          label="Mark resolved"
          pending="Saving…"
          variant="mint"
        />
      ) : null}
    </div>
  );
}
