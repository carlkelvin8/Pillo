import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Card, CardTitle } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { logAudit } from "@/features/audit/log";
import { can } from "@/features/auth/permissions";
import { requireCapability } from "@/features/auth/workspace";
import { ageOn, patientIdLabel } from "@/features/patients/age";
import {
  AddMedicationDialog,
  StartConsultationDialog,
  StopMedicationButton,
} from "@/features/patients/components/clinical-forms";
import { EditPatientDialog } from "@/features/patients/components/patient-dialogs";
import { getPatient, patientAppointments, patientClinical } from "@/features/patients/queries";
import { listDoctors } from "@/features/scheduling/queries";
import { patientBilling } from "@/features/invoices/queries";
import { STATUS_LABEL, STATUS_TONE } from "@/features/scheduling/status";
import { createClient } from "@/lib/supabase/server";
import { dateOf, formatDateShort, formatTime, todayIn } from "@/lib/datetime";
import { initials } from "@/lib/initials";
import { formatPHP } from "@/lib/money";

export const metadata: Metadata = { title: "Patient" };

type Props = { params: Promise<{ id: string }> };

const SEX_LABEL = { female: "Female", male: "Male", other: "Other" } as const;

export default async function PatientRecordPage({ params }: Props) {
  const { membership } = await requireCapability("patients.directory");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const clinicId = membership.clinic.id;
  const tz = membership.clinic.timezone;

  const patient = await getPatient(clinicId, id);
  if (!patient) notFound();

  const canRecords = can(membership.role, "patients.records");
  const canEdit = can(membership.role, "appointments.book");

  // Opening a record is an access to personal data: always leave an audit entry (no patient details in meta).
  const supabase = await createClient();
  await logAudit(supabase, clinicId, "patient.viewed", "patient", id, { role: membership.role });

  const [appointments, clinical, doctors, billing] = await Promise.all([
    patientAppointments(clinicId, id),
    canRecords ? patientClinical(clinicId, id) : Promise.resolve({ visits: [], prescriptions: [] }),
    listDoctors(clinicId),
    can(membership.role, "invoices.create") || can(membership.role, "payments.manage")
      ? patientBilling(clinicId, id)
      : Promise.resolve(null),
  ]);
  const doctorName = new Map(doctors.map((d) => [d.id, d.display_name]));

  const today = todayIn(tz);
  const age = patient.birthdate ? ageOn(patient.birthdate, today) : null;
  const subtitle = [
    age !== null ? `${age}` : null,
    patient.sex ? SEX_LABEL[patient.sex] : null,
    `ID ${patientIdLabel(patient.patient_number)}`,
  ]
    .filter(Boolean)
    .join(" · ");

  const latestVitals = clinical.visits.find((v) => Object.keys(v.vitals).length > 0)?.vitals;
  const now = new Date().toISOString();
  const upcoming = appointments
    .filter((a) => a.starts_at > now && (a.status === "scheduled" || a.status === "confirmed"))
    .reverse();
  const past = appointments.filter((a) => !upcoming.includes(a));

  const tiles: { label: string; value: string; unit: string }[] = [
    {
      label: "Blood pressure",
      value:
        latestVitals?.bp_systolic !== undefined && latestVitals.bp_diastolic !== undefined
          ? `${latestVitals.bp_systolic}/${latestVitals.bp_diastolic}`
          : "—",
      unit: "mmHg",
    },
    { label: "Heart rate", value: latestVitals?.heart_rate?.toString() ?? "—", unit: "bpm" },
    { label: "Weight", value: latestVitals?.weight_kg?.toString() ?? "—", unit: "kg" },
    { label: "Temperature", value: latestVitals?.temp_c?.toString() ?? "—", unit: "°C" },
  ];

  return (
    <>
      <div className="flex flex-col gap-4">
        <Link
          href="/patients"
          className="text-muted hover:text-ink inline-flex min-h-11 w-fit items-center gap-2 text-sm font-medium"
        >
          <ArrowLeft className="size-4" aria-hidden="true" /> Patients
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <span
              aria-hidden="true"
              className="bg-mint text-mint-ink flex size-16 shrink-0 items-center justify-center rounded-full text-xl font-semibold"
            >
              {initials(patient.full_name)}
            </span>
            <div>
              <h1 className="text-title">{patient.full_name}</h1>
              <p className="text-muted mt-1">{subtitle}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            {canEdit ? <EditPatientDialog patient={patient} /> : null}
            {canRecords ? <StartConsultationDialog patientId={patient.id} /> : null}
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <div className="flex flex-col gap-6">
          {canRecords ? (
            <>
              <Card className="flex flex-col gap-4">
                <CardTitle>Latest vitals</CardTitle>
                <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                  {tiles.map((t) => (
                    <div key={t.label} className="rounded-control bg-canvas p-4">
                      <dt className="text-muted text-xs">{t.label}</dt>
                      <dd className="tabular mt-1 text-2xl font-semibold tracking-tight">
                        {t.value}
                      </dd>
                      <dd className="text-muted text-xs">{t.unit}</dd>
                    </div>
                  ))}
                </dl>
              </Card>

              <Card className="flex flex-col gap-4">
                <CardTitle>Visit history</CardTitle>
                {clinical.visits.length === 0 ? (
                  <p className="text-muted">No visits recorded yet.</p>
                ) : (
                  <ul className="divide-line flex flex-col divide-y">
                    {clinical.visits.map((v) => (
                      <li
                        key={v.id}
                        className="flex flex-col gap-1 py-4 first:pt-0 last:pb-0 sm:flex-row sm:gap-6"
                      >
                        <span className="tabular text-muted w-28 shrink-0 text-sm">
                          {formatDateShort(dateOf(v.visited_at, tz))}
                        </span>
                        <div>
                          <p className="font-semibold">{v.title ?? "Visit"}</p>
                          {v.notes ? (
                            <p className="text-ink-2 mt-1 whitespace-pre-line">{v.notes}</p>
                          ) : null}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </>
          ) : (
            <Card className="text-muted">
              Clinical records (vitals, visits and medications) are visible to doctors and the
              clinic owner.
            </Card>
          )}

          <Card className="flex flex-col gap-4">
            <CardTitle>Appointments</CardTitle>
            {appointments.length === 0 ? (
              <p className="text-muted">No appointments yet.</p>
            ) : (
              <ul className="divide-line flex flex-col divide-y">
                {[...upcoming, ...past].map((a) => (
                  <li
                    key={a.id}
                    className="flex flex-wrap items-center gap-x-6 gap-y-1 py-3 first:pt-0 last:pb-0"
                  >
                    <span className="tabular text-muted w-28 shrink-0 text-sm">
                      {formatDateShort(dateOf(a.starts_at, tz))}
                    </span>
                    <span className="tabular text-sm">{formatTime(a.starts_at, tz)}</span>
                    <span className="text-ink-2 min-w-0 flex-1 truncate">
                      {a.reason ?? "Appointment"} · {doctorName.get(a.doctor_id) ?? "Doctor"}
                    </span>
                    <Chip tone={STATUS_TONE[a.status]}>{STATUS_LABEL[a.status]}</Chip>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          {billing ? (
            <Card className="flex flex-col gap-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <CardTitle>Billing</CardTitle>
                <span className="tabular font-semibold">Outstanding {formatPHP(billing.outstandingCentavos)}</span>
              </div>
              {billing.invoices.length ? (
                <ul className="divide-line flex flex-col divide-y">
                  {billing.invoices.map((invoice) => (
                    <li key={invoice.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                      <Link href={`/invoices/${invoice.id}`} className="font-medium underline">Invoice #{invoice.invoice_number}</Link>
                      <span className="tabular">{formatPHP(invoice.total_centavos)}</span>
                      <Chip tone={invoice.status === "paid" ? "success" : invoice.status === "sent" ? "pending" : "neutral"}>{invoice.status}</Chip>
                    </li>
                  ))}
                </ul>
              ) : <p className="text-muted">No invoices yet.</p>}
              <h3 className="font-semibold">Payment history</h3>
              {billing.payments.length ? <ul className="divide-line flex flex-col divide-y">{billing.payments.map((payment) => <li key={payment.id} className="flex flex-wrap justify-between gap-2 py-2 text-sm"><span>{payment.method === "cash" ? "Cash" : payment.method === "bank" ? "Bank transfer" : "Online payment"} · {payment.status}</span><span className="tabular">{formatPHP(payment.amount_centavos)}{payment.paid_at ? ` · ${formatDateShort(dateOf(payment.paid_at, tz))}` : ""}</span></li>)}</ul> : <p className="text-muted text-sm">No payments recorded.</p>}
            </Card>
          ) : null}
        </div>

        <div className="flex flex-col gap-6">
          <Card className="flex flex-col gap-3">
            <CardTitle>Contact</CardTitle>
            <dl className="flex flex-col gap-3 text-sm">
              <div>
                <dt className="text-muted">Phone</dt>
                <dd className="font-medium">{patient.phone ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-muted">Email</dt>
                <dd className="font-medium break-all">{patient.email ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-muted">Consent</dt>
                <dd>
                  {patient.consent_at ? (
                    <Chip tone="success">
                      Recorded {formatDateShort(dateOf(patient.consent_at, tz))}
                    </Chip>
                  ) : (
                    <Chip tone="pending">Not recorded</Chip>
                  )}
                </dd>
              </div>
            </dl>
          </Card>

          {canRecords ? (
            <Card className="flex flex-col gap-4">
              <div className="flex items-center justify-between gap-3">
                <CardTitle>Active medications</CardTitle>
                <AddMedicationDialog patientId={patient.id} />
              </div>
              {clinical.prescriptions.length === 0 ? (
                <p className="text-muted">No active medications.</p>
              ) : (
                <ul className="divide-line flex flex-col divide-y">
                  {clinical.prescriptions.map((rx) => (
                    <li
                      key={rx.id}
                      className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-semibold">{rx.medication}</p>
                        {rx.dosage ? <p className="text-muted text-sm">{rx.dosage}</p> : null}
                      </div>
                      <StopMedicationButton
                        prescriptionId={rx.id}
                        patientId={patient.id}
                        name={rx.medication}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}
