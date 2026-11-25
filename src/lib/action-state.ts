import { z } from "zod";

/** Shape returned by Server Actions used with useActionState. */
export type ActionState = {
  ok?: boolean;
  message?: string;
  fieldErrors?: Record<string, string[] | undefined>;
  /** Non-sensitive input echoed back so a failed submit does not clear the form. Never passwords. */
  values?: Record<string, string>;
  /** Extra result data for the UI, e.g. a link to copy. */
  data?: Record<string, string>;
};

export function echo(formData: FormData, keys: readonly string[]): Record<string, string> {
  return Object.fromEntries(keys.map((k) => [k, formString(formData, k)]));
}

export function validationFailed(
  error: z.ZodError,
  formData?: FormData,
  keep: readonly string[] = [],
): ActionState {
  return {
    message: "Please check the highlighted fields.",
    fieldErrors: z.flattenError(error).fieldErrors,
    values: formData ? echo(formData, keep) : undefined,
  };
}

/** FormData values are string | File | null; keep only strings. */
export function formString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}
