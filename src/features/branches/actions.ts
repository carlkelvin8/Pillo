"use server";

import { revalidatePath } from "next/cache";
import { logAudit } from "@/features/audit/log";
import { can } from "@/features/auth/permissions";
import { getWorkspace } from "@/features/auth/workspace";
import {
  branchFormSchema,
  doctorFormSchema,
  doctorHoursFormSchema,
  hoursFormSchema,
  WEEKDAYS,
} from "@/features/branches/schemas";
import { echo, formString, validationFailed, type ActionState } from "@/lib/action-state";
import { createClient } from "@/lib/supabase/server";
import { doctorHoursOverlap } from "@/features/scheduling/slots";

const DENIED: ActionState = { message: "Only the clinic owner can change this." };

async function owner() {
  const ws = await getWorkspace();
  if (!ws?.membership || !can(ws.membership.role, "staff.manage")) return null;
  return { user: ws.user, membership: ws.membership, clinicId: ws.membership.clinic.id };
}

const uuid = (v: string) => /^[0-9a-f-]{36}$/i.test(v);
const BRANCH_FIELDS = ["name", "address", "phone", "latitude", "longitude"] as const;

function branchFromForm(formData: FormData) {
  return branchFormSchema.safeParse({
    name: formString(formData, "name"),
    address: formString(formData, "address"),
    phone: formString(formData, "phone"),
    latitude: formData.has("latitude") ? formString(formData, "latitude") : undefined,
    longitude: formData.has("longitude") ? formString(formData, "longitude") : undefined,
  });
}

export async function createBranchAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await owner();
  if (!ctx) return DENIED;
  const parsed = branchFromForm(formData);
  if (!parsed.success) return validationFailed(parsed.error, formData, BRANCH_FIELDS);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("branches")
    .insert({
      clinic_id: ctx.clinicId,
      name: parsed.data.name,
      address: parsed.data.address ?? null,
      phone: parsed.data.phone ?? null,
      latitude: parsed.data.latitude ?? null,
      longitude: parsed.data.longitude ?? null,
    })
    .select("id");
  if (error || !data?.length)
    return {
      message: "We could not add the branch.",
      values: echo(formData, BRANCH_FIELDS),
    };
  await logAudit(
    supabase,
    ctx.clinicId,
    "branch.created",
    "branch",
    String((data[0] as { id: unknown }).id),
  );
  revalidatePath("/settings/branches");
  return { ok: true, message: "Branch added." };
}

export async function updateBranchAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await owner();
  if (!ctx) return DENIED;
  const id = formString(formData, "branchId");
  if (!uuid(id)) return { message: "Invalid branch." };
  const parsed = branchFromForm(formData);
  if (!parsed.success) return validationFailed(parsed.error, formData, BRANCH_FIELDS);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("branches")
    .update({
      name: parsed.data.name,
      address: parsed.data.address ?? null,
      phone: parsed.data.phone ?? null,
      ...(parsed.data.latitude !== undefined || parsed.data.longitude !== undefined
        ? { latitude: parsed.data.latitude ?? null, longitude: parsed.data.longitude ?? null }
        : {}),
    })
    .eq("id", id)
    .eq("clinic_id", ctx.clinicId)
    .select("id");
  if (error || !data?.length)
    return { message: "We could not save the branch.", values: echo(formData, BRANCH_FIELDS) };
  await logAudit(supabase, ctx.clinicId, "branch.updated", "branch", id);
  revalidatePath("/settings/branches");
  return { ok: true, message: "Saved." };
}

/** Replace a branch's weekly hours. One window per open day. */
export async function saveHoursAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await owner();
  if (!ctx) return DENIED;
  const days = WEEKDAYS.map(({ value }) => ({
    weekday: value,
    open: formData.get(`open_${value}`) === "on",
    opens: formString(formData, `opens_${value}`) || "09:00",
    closes: formString(formData, `closes_${value}`) || "17:00",
  }));
  const parsed = hoursFormSchema.safeParse({ branchId: formString(formData, "branchId"), days });
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return { message: first?.message ?? "Please check the hours." };
  }
  const supabase = await createClient();
  const { branchId } = parsed.data;
  const { error: delError } = await supabase
    .from("clinic_hours")
    .delete()
    .eq("clinic_id", ctx.clinicId)
    .eq("branch_id", branchId);
  if (delError) return { message: "We could not save the hours." };
  const rows = parsed.data.days
    .filter((d) => d.open)
    .map((d) => ({
      clinic_id: ctx.clinicId,
      branch_id: branchId,
      weekday: d.weekday,
      opens_at: d.opens,
      closes_at: d.closes,
    }));
  if (rows.length > 0) {
    const { error } = await supabase.from("clinic_hours").insert(rows);
    if (error) return { message: "We could not save the hours." };
  }
  await logAudit(supabase, ctx.clinicId, "hours.updated", "branch", branchId);
  revalidatePath("/settings/branches");
  revalidatePath("/appointments");
  return { ok: true, message: "Hours saved." };
}

export async function addDoctorAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await owner();
  if (!ctx) return DENIED;
  const parsed = doctorFormSchema.safeParse({
    displayName: formString(formData, "displayName"),
    specialty: formString(formData, "specialty"),
  });
  if (!parsed.success)
    return validationFailed(parsed.error, formData, ["displayName", "specialty"]);
  const supabase = await createClient();
  // "Add me": link the owner's own membership so their login is the practitioner.
  const linkSelf = formData.get("linkSelf") === "on";
  const { data, error } = await supabase
    .from("doctors")
    .insert({
      clinic_id: ctx.clinicId,
      display_name: parsed.data.displayName,
      specialty: parsed.data.specialty ?? null,
      membership_id: linkSelf ? ctx.membership.id : null,
    })
    .select("id");
  if (error?.code === "23505")
    return {
      message: "You are already listed as a doctor.",
      values: echo(formData, ["displayName", "specialty"]),
    };
  if (error || !data?.length)
    return {
      message: "We could not add the doctor.",
      values: echo(formData, ["displayName", "specialty"]),
    };
  await logAudit(
    supabase,
    ctx.clinicId,
    "doctor.created",
    "doctor",
    String((data[0] as { id: unknown }).id),
  );
  revalidatePath("/settings/doctors");
  return { ok: true, message: "Doctor added." };
}

export async function setDoctorActiveAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await owner();
  if (!ctx) return DENIED;
  const id = formString(formData, "doctorId");
  if (!uuid(id)) return { message: "Invalid doctor." };
  const active = formString(formData, "active") === "true";
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("doctors")
    .update({ active })
    .eq("id", id)
    .eq("clinic_id", ctx.clinicId)
    .select("id");
  if (error || !data?.length) return { message: "We could not update that doctor." };
  await logAudit(
    supabase,
    ctx.clinicId,
    active ? "doctor.activated" : "doctor.deactivated",
    "doctor",
    id,
  );
  revalidatePath("/settings/doctors");
  revalidatePath("/appointments");
  return { ok: true };
}

export async function saveDoctorHoursAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await owner();
  if (!ctx) return DENIED;
  const parsed = doctorHoursFormSchema.safeParse({
    doctorId: formString(formData, "doctorId"),
    branchId: formString(formData, "branchId"),
    weekday: formString(formData, "weekday"),
    startsAt: formString(formData, "startsAt"),
    endsAt: formString(formData, "endsAt"),
    windowId: formString(formData, "windowId"),
  });
  if (!parsed.success) return { message: parsed.error.issues[0]?.message ?? "Check the hours." };

  const supabase = await createClient();
  const input = parsed.data;
  const [doctor, branch, existingResult] = await Promise.all([
    supabase
      .from("doctors")
      .select("id")
      .eq("clinic_id", ctx.clinicId)
      .eq("id", input.doctorId)
      .maybeSingle(),
    supabase
      .from("branches")
      .select("id")
      .eq("clinic_id", ctx.clinicId)
      .eq("id", input.branchId)
      .maybeSingle(),
    supabase
      .from("doctor_hours")
      .select("id, weekday, starts_at, ends_at")
      .eq("clinic_id", ctx.clinicId)
      .eq("doctor_id", input.doctorId)
      .eq("branch_id", input.branchId),
  ]);
  if (doctor.error || branch.error || existingResult.error || !doctor.data || !branch.data)
    return { message: "We could not verify that doctor and branch." };
  const existing = (existingResult.data ?? []).filter((row) => row.id !== input.windowId);
  if (
    doctorHoursOverlap(
      { weekday: input.weekday, start: input.startsAt, end: input.endsAt },
      existing.map((row) => ({ weekday: row.weekday, start: row.starts_at, end: row.ends_at })),
    )
  )
    return { message: "This window overlaps another window for that doctor." };

  const values = {
    clinic_id: ctx.clinicId,
    doctor_id: input.doctorId,
    branch_id: input.branchId,
    weekday: input.weekday,
    starts_at: input.startsAt,
    ends_at: input.endsAt,
  };
  const result = input.windowId
    ? await supabase
        .from("doctor_hours")
        .update(values)
        .eq("id", input.windowId)
        .eq("clinic_id", ctx.clinicId)
        .select("id")
    : await supabase.from("doctor_hours").insert(values).select("id");
  if (result.error || !result.data?.length) return { message: "We could not save that window." };
  await logAudit(supabase, ctx.clinicId, "doctor.hours_updated", "doctor", input.doctorId);
  revalidatePath("/settings/doctors");
  revalidatePath("/appointments");
  return { ok: true, message: "Weekly hours saved." };
}

export async function removeDoctorHoursAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await owner();
  if (!ctx) return DENIED;
  const id = formString(formData, "windowId");
  if (!uuid(id)) return { message: "Invalid hours window." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("doctor_hours")
    .delete()
    .eq("id", id)
    .eq("clinic_id", ctx.clinicId)
    .select("doctor_id");
  if (error || !data?.length) return { message: "We could not remove that window." };
  const doctorId = data[0]?.doctor_id;
  if (doctorId)
    await logAudit(supabase, ctx.clinicId, "doctor.hours_updated", "doctor", String(doctorId));
  revalidatePath("/settings/doctors");
  revalidatePath("/appointments");
  return { ok: true, message: "Weekly hours removed." };
}
