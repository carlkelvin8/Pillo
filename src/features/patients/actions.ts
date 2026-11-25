"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { logAudit } from "@/features/audit/log";
import { can } from "@/features/auth/permissions";
import { getWorkspace } from "@/features/auth/workspace";
import {
  patientFormSchema,
  prescriptionFormSchema,
  visitFormSchema,
} from "@/features/patients/schemas";
import { sanitizeSearch } from "@/features/patients/age";
import { echo, formString, validationFailed, type ActionState } from "@/lib/action-state";
import { createClient } from "@/lib/supabase/server";

const DENIED: ActionState = { message: "You do not have permission to do that." };
const PATIENT_KEYS = ["fullName", "birthdate", "sex", "phone", "email"] as const;

function patientInput(formData: FormData) {
  return patientFormSchema.safeParse({
    fullName: formString(formData, "fullName"),
    birthdate: formString(formData, "birthdate"),
    sex: formString(formData, "sex"),
    phone: formString(formData, "phone"),
    email: formString(formData, "email"),
    consent: formData.get("consent") === "on",
  });
}

export async function createPatientAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ws = await getWorkspace();
  if (!ws?.membership || !can(ws.membership.role, "appointments.book")) return DENIED;
  const parsed = patientInput(formData);
  if (!parsed.success) return validationFailed(parsed.error, formData, PATIENT_KEYS);

  const supabase = await createClient();
  const clinicId = ws.membership.clinic.id;
  const { data, error } = await supabase
    .from("patients")
    .insert({
      clinic_id: clinicId,
      full_name: parsed.data.fullName,
      birthdate: parsed.data.birthdate ?? null,
      sex: parsed.data.sex ?? null,
      phone: parsed.data.phone ?? null,
      email: parsed.data.email ?? null,
      consent_at: parsed.data.consent ? new Date().toISOString() : null,
    })
    .select("id")
    .single();
  if (error || !data) {
    return {
      message: "We could not save the patient. Please try again.",
      values: echo(formData, PATIENT_KEYS),
    };
  }
  const id = String((data as { id: unknown }).id);
  await logAudit(supabase, clinicId, "patient.created", "patient", id);
  revalidatePath("/patients");
  redirect(`/patients/${id}`);
}

export async function updatePatientAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ws = await getWorkspace();
  if (!ws?.membership || !can(ws.membership.role, "appointments.book")) return DENIED;
  const id = formString(formData, "patientId");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { message: "Invalid patient." };
  const parsed = patientInput(formData);
  if (!parsed.success) return validationFailed(parsed.error, formData, PATIENT_KEYS);

  const supabase = await createClient();
  const clinicId = ws.membership.clinic.id;
  // consent is only ever recorded or kept, never silently withdrawn here.
  const patch: Record<string, string | null> = {
    full_name: parsed.data.fullName,
    birthdate: parsed.data.birthdate ?? null,
    sex: parsed.data.sex ?? null,
    phone: parsed.data.phone ?? null,
    email: parsed.data.email ?? null,
  };
  if (parsed.data.consent) {
    const { data: existing } = await supabase
      .from("patients")
      .select("consent_at")
      .eq("id", id)
      .eq("clinic_id", clinicId)
      .maybeSingle();
    if (!(existing as { consent_at: string | null } | null)?.consent_at)
      patch.consent_at = new Date().toISOString();
  }
  const { data, error } = await supabase
    .from("patients")
    .update(patch)
    .eq("id", id)
    .eq("clinic_id", clinicId)
    .select("id");
  if (error || !data?.length)
    return { message: "We could not save your changes.", values: echo(formData, PATIENT_KEYS) };

  await logAudit(supabase, clinicId, "patient.updated", "patient", id);
  revalidatePath(`/patients/${id}`);
  revalidatePath("/patients");
  return { ok: true, message: "Saved." };
}

const VITAL_KEYS = ["bp_systolic", "bp_diastolic", "heart_rate", "weight_kg", "temp_c"] as const;

export async function addVisitAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const ws = await getWorkspace();
  if (!ws?.membership || !can(ws.membership.role, "patients.records")) return DENIED;
  const parsed = visitFormSchema.safeParse({
    patientId: formString(formData, "patientId"),
    title: formString(formData, "title"),
    notes: formString(formData, "notes"),
    vitals: Object.fromEntries(VITAL_KEYS.map((k) => [k, formString(formData, k)])),
  });
  if (!parsed.success) {
    // Errors for nested vitals come back with a path like ["vitals", "heart_rate"]: key them by the last segment.
    const errors: Record<string, string[] | undefined> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[issue.path.length - 1] ?? "form");
      errors[key] = [...(errors[key] ?? []), issue.message];
    }
    return {
      message: "Please check the highlighted fields.",
      fieldErrors: errors,
      values: echo(formData, ["title", "notes", ...VITAL_KEYS]),
    };
  }

  const supabase = await createClient();
  const clinicId = ws.membership.clinic.id;
  const vitals = Object.fromEntries(
    Object.entries(parsed.data.vitals).filter(([, v]) => v !== undefined),
  );
  const [doctor] = ((
    await supabase
      .from("doctors")
      .select("id")
      .eq("clinic_id", clinicId)
      .eq("membership_id", ws.membership.id)
  ).data ?? []) as { id: string }[];
  const { data, error } = await supabase
    .from("visits")
    .insert({
      clinic_id: clinicId,
      patient_id: parsed.data.patientId,
      doctor_id: doctor?.id ?? null,
      title: parsed.data.title ?? null,
      notes: parsed.data.notes ?? null,
      vitals,
    })
    .select("id");
  if (error || !data?.length)
    return {
      message: "We could not save the visit.",
      values: echo(formData, ["title", "notes", ...VITAL_KEYS]),
    };

  await logAudit(
    supabase,
    clinicId,
    "visit.created",
    "visit",
    String((data[0] as { id: unknown }).id),
  );
  revalidatePath(`/patients/${parsed.data.patientId}`);
  return { ok: true, message: "Visit saved." };
}

export async function addPrescriptionAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ws = await getWorkspace();
  if (!ws?.membership || !can(ws.membership.role, "patients.records")) return DENIED;
  const parsed = prescriptionFormSchema.safeParse({
    patientId: formString(formData, "patientId"),
    medication: formString(formData, "medication"),
    dosage: formString(formData, "dosage"),
  });
  if (!parsed.success) return validationFailed(parsed.error, formData, ["medication", "dosage"]);

  const supabase = await createClient();
  const clinicId = ws.membership.clinic.id;
  const { data, error } = await supabase
    .from("prescriptions")
    .insert({
      clinic_id: clinicId,
      patient_id: parsed.data.patientId,
      medication: parsed.data.medication,
      dosage: parsed.data.dosage ?? null,
    })
    .select("id");
  if (error || !data?.length)
    return {
      message: "We could not save the medication.",
      values: echo(formData, ["medication", "dosage"]),
    };

  await logAudit(
    supabase,
    clinicId,
    "prescription.created",
    "prescription",
    String((data[0] as { id: unknown }).id),
  );
  revalidatePath(`/patients/${parsed.data.patientId}`);
  return { ok: true, message: "Medication added." };
}

export async function stopPrescriptionAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ws = await getWorkspace();
  if (!ws?.membership || !can(ws.membership.role, "patients.records")) return DENIED;
  const id = formString(formData, "prescriptionId");
  const patientId = formString(formData, "patientId");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { message: "Invalid medication." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("prescriptions")
    .update({ active: false })
    .eq("id", id)
    .eq("clinic_id", ws.membership.clinic.id)
    .select("id");
  if (error || !data?.length) return { message: "We could not update that medication." };
  revalidatePath(`/patients/${patientId}`);
  return { ok: true };
}

/** For the New appointment and waitlist patient pickers. */
export async function searchPatientsAction(
  query: string,
): Promise<{ id: string; name: string; number: number }[]> {
  const ws = await getWorkspace();
  if (!ws?.membership || !can(ws.membership.role, "patients.directory")) return [];
  const q = sanitizeSearch(query);
  if (q.length < 2) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("patients")
    .select("id, full_name, patient_number")
    .eq("clinic_id", ws.membership.clinic.id)
    .or(`full_name.ilike.%${q}%,phone.ilike.%${q}%`)
    .order("full_name", { ascending: true })
    .limit(8);
  return ((data ?? []) as { id: string; full_name: string; patient_number: number }[]).map((r) => ({
    id: r.id,
    name: r.full_name,
    number: r.patient_number,
  }));
}
