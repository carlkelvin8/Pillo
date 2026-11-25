"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { can } from "@/features/auth/permissions";
import { getWorkspace } from "@/features/auth/workspace";
import { echo, formString, type ActionState } from "@/lib/action-state";
import { nextBusinessDay, todayIn } from "@/lib/datetime";
import { parsePesosToCentavos } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";

const withdrawSchema = z.object({
  amount: z
    .string()
    .trim()
    .transform((v, ctx) => {
      const c = parsePesosToCentavos(v);
      if (c === null || c <= 0) {
        ctx.addIssue({ code: "custom", message: "Enter an amount like 5,000.00." });
        return z.NEVER;
      }
      return c;
    }),
  // A label only (e.g. "BDO ••1920"). Full account numbers are never stored.
  destination: z
    .string()
    .trim()
    .min(1, "Name the destination, for example BDO ••1920.")
    .max(60)
    .refine(
      (v) => !/\d{9,}/.test(v.replace(/[\s-]/g, "")),
      "Enter only the last 4 digits, never the full account number.",
    ),
});

/** MOCK payout. Records the request in the database; no real money moves. */
export async function requestPayoutAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ws = await getWorkspace();
  if (!ws?.membership || !can(ws.membership.role, "payments.manage"))
    return { message: "You do not have permission to do that." };
  const parsed = withdrawSchema.safeParse({
    amount: formString(formData, "amount"),
    destination: formString(formData, "destination"),
  });
  if (!parsed.success) {
    const errors: Record<string, string[] | undefined> = {};
    for (const i of parsed.error.issues) errors[String(i.path[0] ?? "form")] = [i.message];
    return {
      message: "Please check the highlighted fields.",
      fieldErrors: errors,
      values: echo(formData, ["amount", "destination"]),
    };
  }
  const { clinic } = ws.membership;
  const arrives = nextBusinessDay(todayIn(clinic.timezone));
  const supabase = await createClient();
  const { error } = await supabase.rpc("request_payout", {
    p_clinic_id: clinic.id,
    p_amount_centavos: parsed.data.amount,
    p_destination: parsed.data.destination,
    p_arrives_on: arrives,
  });
  if (error) {
    const msg = /more than the available balance/i.test(error.message)
      ? "That is more than the available balance."
      : "We could not record that withdrawal.";
    return { message: msg, values: echo(formData, ["amount", "destination"]) };
  }
  revalidatePath("/payments");
  revalidatePath("/dashboard");
  return { ok: true, message: "Demo withdrawal recorded. No real money moved." };
}
