"use client";

import { ImagePlus, Trash2 } from "lucide-react";
import { useActionState, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/form-message";
import { SubmitButton } from "@/components/ui/submit-button";
import { removeClinicLogoAction, uploadClinicLogoAction } from "@/features/clinic/actions";
import { LOGO_MAX_BYTES } from "@/features/clinic/logo";
import type { ActionState } from "@/lib/action-state";

type Props = { clinicName: string; logoUrl: string | null };

/** Owner-only logo upload with a live preview. Shown in the sidebar instead of the letter badge. */
export function ClinicLogoForm({ clinicName, logoUrl }: Props) {
  const [state, action] = useActionState<ActionState, FormData>(uploadClinicLogoAction, {});
  const [removeState, removeAction] = useActionState<ActionState, FormData>(
    async () => removeClinicLogoAction(),
    {},
  );
  const [preview, setPreview] = useState<string | null>(null);
  const [clientError, setClientError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const shown = preview ?? logoUrl;
  const initial = clinicName.trim().charAt(0).toUpperCase() || "C";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-4">
        <span
          aria-hidden="true"
          className="bg-mint text-mint-ink rounded-control border-line flex size-20 shrink-0 items-center justify-center overflow-hidden border text-3xl font-semibold"
        >
          {shown ? (
            // eslint-disable-next-line @next/next/no-img-element -- user-uploaded, already size-limited
            <img src={shown} alt="" className="size-full object-cover" />
          ) : (
            initial
          )}
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <p className="font-semibold">Clinic logo</p>
          <p className="text-muted text-sm">
            Shown in the sidebar instead of the letter. Square PNG, JPG or WebP, up to 1 MB.
          </p>
        </div>
      </div>

      <form action={action} className="flex flex-col gap-3">
        <FormMessage state={clientError ? { message: clientError } : state} />
        <label className="sr-only" htmlFor="clinic-logo-input">
          Choose a logo image
        </label>
        <input
          ref={input}
          id="clinic-logo-input"
          name="logo"
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="rounded-control border-line-strong file:bg-subtle file:text-ink min-h-11 w-full border text-sm file:mr-3 file:min-h-11 file:border-0 file:px-4 file:font-medium"
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            setClientError(null);
            if (!file) return setPreview(null);
            if (file.size > LOGO_MAX_BYTES) {
              setClientError("The logo must be 1 MB or smaller.");
              event.currentTarget.value = "";
              return setPreview(null);
            }
            setPreview(URL.createObjectURL(file));
          }}
        />
        <div className="flex flex-wrap gap-3">
          <SubmitButton pendingLabel="Uploading…" disabled={!preview}>
            <ImagePlus aria-hidden="true" /> Upload logo
          </SubmitButton>
        </div>
      </form>

      {logoUrl ? (
        <form action={removeAction} className="flex flex-col gap-2">
          <Button type="submit" variant="ghost" className="w-fit">
            <Trash2 aria-hidden="true" /> Remove logo
          </Button>
          {removeState.message && !removeState.ok ? <FormMessage state={removeState} /> : null}
        </form>
      ) : null}
    </div>
  );
}
