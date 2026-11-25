"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/ui/submit-button";
import { FormMessage } from "@/components/ui/form-message";
import { approveMcpPaymentRequestAction, rejectMcpPaymentRequestAction } from "@/features/assistant/actions";
import type { McpPaymentRequest } from "@/features/assistant/queries";
import type { ActionState } from "@/lib/action-state";
import { formatPHP } from "@/lib/money";

function Decision({ requestId, approve }: { requestId: string; approve: boolean }) {
  const actionFn = approve ? approveMcpPaymentRequestAction : rejectMcpPaymentRequestAction;
  const [state, action] = useActionState<ActionState, FormData>(actionFn, {});
  return <form action={action} className="flex items-center gap-2">
    <input type="hidden" name="requestId" value={requestId} />
    <SubmitButton variant={approve ? "mint" : "ghost"} pendingLabel={approve ? "Creating link…" : "Rejecting…"}>
      {approve ? "Approve and create link" : "Reject"}
    </SubmitButton>
    {state.message ? <FormMessage state={state} /> : null}
  </form>;
}

export function McpPaymentRequests({ requests }: { requests: McpPaymentRequest[] }) {
  if (!requests.length) return <p className="text-muted">No MCP payment requests are waiting for approval.</p>;
  return <ul className="divide-line divide-y">
    {requests.map((request) => <li key={request.id} className="flex flex-wrap items-center gap-4 py-4 first:pt-0 last:pb-0">
      <div className="min-w-0 flex-1">
        <p className="font-semibold">Invoice INV-{String(request.invoiceNumber).padStart(4, "0")}</p>
        <p className="text-muted text-sm">Amount due {formatPHP(request.dueCentavos)} · Requested by an MCP client</p>
      </div>
      <div className="flex flex-wrap gap-2"><Decision requestId={request.id} approve /><Decision requestId={request.id} approve={false} /></div>
    </li>)}
  </ul>;
}
