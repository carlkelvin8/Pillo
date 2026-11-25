"use server";

import { redirect } from "next/navigation";
import {
  forgotPasswordSchema,
  resetPasswordSchema,
  signInSchema,
  signUpSchema,
} from "@/features/auth/schemas";
import { echo, formString, validationFailed, type ActionState } from "@/lib/action-state";
import { publicEnv } from "@/lib/env";
import { safeNext } from "@/lib/safe-redirect";
import { createClient } from "@/lib/supabase/server";

export async function signInAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = signInSchema.safeParse({
    email: formString(formData, "email"),
    password: formString(formData, "password"),
  });
  if (!parsed.success) return validationFailed(parsed.error, formData, ["email"]);

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    const values = echo(formData, ["email"]);
    if (error.code === "email_not_confirmed") {
      return { message: "Confirm your email first. Check your inbox for the link.", values };
    }
    // Same message for unknown email and wrong password.
    return { message: "Email or password is incorrect.", values };
  }
  redirect(safeNext(formString(formData, "next")) ?? "/dashboard");
}

export async function signUpAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = signUpSchema.safeParse({
    fullName: formString(formData, "fullName"),
    email: formString(formData, "email"),
    password: formString(formData, "password"),
  });
  if (!parsed.success) return validationFailed(parsed.error, formData, ["fullName", "email"]);

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { full_name: parsed.data.fullName },
      emailRedirectTo: `${publicEnv().NEXT_PUBLIC_SITE_URL}/auth/callback`,
    },
  });
  if (error) {
    return {
      message: "We could not create your account. Please try again.",
      values: echo(formData, ["fullName", "email"]),
    };
  }
  if (data.session) redirect("/onboarding");
  // Same response whether or not the email already exists.
  return {
    ok: true,
    message: "Check your email for a confirmation link to finish creating your account.",
  };
}

export async function signOutAction(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export async function requestPasswordResetAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = forgotPasswordSchema.safeParse({ email: formString(formData, "email") });
  if (!parsed.success) return validationFailed(parsed.error);

  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${publicEnv().NEXT_PUBLIC_SITE_URL}/auth/recovery`,
  });
  // Never reveal whether the email has an account.
  return { ok: true, message: "If that email has an account, a reset link is on its way." };
}

export async function updatePasswordAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = resetPasswordSchema.safeParse({
    password: formString(formData, "password"),
    confirm: formString(formData, "confirm"),
  });
  if (!parsed.success) return validationFailed(parsed.error);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { message: "Your reset link expired. Request a new one." };

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return { message: "We could not update your password. Try a different one." };
  redirect("/dashboard");
}
