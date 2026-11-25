"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/ui/submit-button";
import { revokeInvitationAction } from "@/features/staff/actions";
import type { ActionState } from "@/lib/action-state";

export function RevokeButton({ invitationId }: { invitationId: string }) {
  const [state, action] = useActionState<ActionState, FormData>(revokeInvitationAction, {});
  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="invitationId" value={invitationId} />
      {state.message && !state.ok ? (
        <span role="alert" className="text-danger-chip-ink text-sm">
          {state.message}
        </span>
      ) : null}
      <SubmitButton variant="ghost" pendingLabel="Revoking…">
        Revoke
      </SubmitButton>
    </form>
  );
}
