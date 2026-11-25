import { cloneElement, useId, type ReactElement } from "react";
import { Label } from "./label";

type FieldProps = {
  label: string;
  hint?: string;
  error?: string;
  /** A single form control (Input, Select, Textarea). Gets id and aria wiring. */
  children: ReactElement<{ id?: string; "aria-describedby"?: string; "aria-invalid"?: boolean }>;
};

export function Field({ label, hint, error, children }: FieldProps) {
  const id = useId();
  const noteId = `${id}-note`;
  const note = error ?? hint;
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      {cloneElement(children, {
        id,
        "aria-describedby": note ? noteId : undefined,
        "aria-invalid": error ? true : undefined,
      })}
      {note ? (
        <p id={noteId} className={error ? "text-danger-chip-ink text-sm" : "text-muted text-sm"}>
          {note}
        </p>
      ) : null}
    </div>
  );
}
