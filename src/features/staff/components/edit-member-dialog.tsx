"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/form-message";
import { Select } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { ROLES, ROLE_LABELS, type Role } from "@/features/auth/permissions";
import { changeRoleAction, removeMemberAction } from "@/features/staff/actions";
import type { ActionState } from "@/lib/action-state";

type Props = { membershipId: string; displayName: string; role: Role };

export function EditMemberDialog({ membershipId, displayName, role }: Props) {
  const [roleState, roleAction] = useActionState<ActionState, FormData>(changeRoleAction, {});
  const [removeState, removeAction] = useActionState<ActionState, FormData>(removeMemberAction, {});
  const [confirming, setConfirming] = useState(false);

  return (
    <Dialog onOpenChange={() => setConfirming(false)}>
      <DialogTrigger asChild>
        <Button variant="ghost" aria-label={`Edit ${displayName}`}>
          Edit
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogTitle>{displayName}</DialogTitle>
        <DialogDescription>
          Change what this person can do, or remove their access.
        </DialogDescription>

        <form action={roleAction} className="mt-5 flex flex-col gap-4">
          <input type="hidden" name="membershipId" value={membershipId} />
          <FormMessage state={roleState} />
          <Field label="Role" error={roleState.fieldErrors?.role?.[0]}>
            <Select name="role" defaultValue={role}>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </Select>
          </Field>
          <div className="flex justify-end gap-3">
            <DialogClose asChild>
              <Button variant="ghost">Close</Button>
            </DialogClose>
            <SubmitButton pendingLabel="Saving…">Save role</SubmitButton>
          </div>
        </form>

        <form action={removeAction} className="border-line mt-6 flex flex-col gap-3 border-t pt-5">
          <input type="hidden" name="membershipId" value={membershipId} />
          <FormMessage state={removeState} />
          {confirming ? (
            <>
              <p className="text-sm">
                Remove {displayName} from the clinic? They lose access immediately. This cannot be
                undone, but you can invite them again.
              </p>
              <div className="flex gap-3">
                <SubmitButton variant="danger" pendingLabel="Removing…">
                  Yes, remove
                </SubmitButton>
                <Button variant="ghost" onClick={() => setConfirming(false)}>
                  Keep
                </Button>
              </div>
            </>
          ) : (
            <div>
              <Button variant="danger" onClick={() => setConfirming(true)}>
                Remove from clinic
              </Button>
            </div>
          )}
        </form>
      </DialogContent>
    </Dialog>
  );
}
