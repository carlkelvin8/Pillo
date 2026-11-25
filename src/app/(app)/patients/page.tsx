import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, Search } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, Td, Th } from "@/components/ui/table";
import { can } from "@/features/auth/permissions";
import { requireCapability } from "@/features/auth/workspace";
import { ageOn, patientIdLabel } from "@/features/patients/age";
import { AddPatientDialog } from "@/features/patients/components/patient-dialogs";
import { PatientImport } from "@/features/patients/components/patient-import";
import {
  listPatients,
  PAGE_SIZE,
  patientStats,
  visitSummaries,
  type PatientListFilter,
} from "@/features/patients/queries";
import { dateOf, formatDateShort, todayIn, zonedToUtcIso } from "@/lib/datetime";
import { initials } from "@/lib/initials";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Patients" };

type Props = { searchParams: Promise<{ q?: string; filter?: string; page?: string }> };

const SEX_SHORT = { female: "F", male: "M", other: "O" } as const;

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <Card className="flex flex-col gap-1">
      <span className="text-muted text-sm">{label}</span>
      <span className="tabular text-3xl font-semibold tracking-tight">
        {value.toLocaleString("en-PH")}
      </span>
    </Card>
  );
}

export default async function PatientsPage({ searchParams }: Props) {
  const { membership } = await requireCapability("patients.directory");
  const params = await searchParams;
  const tz = membership.clinic.timezone;
  const clinicId = membership.clinic.id;
  const filter: PatientListFilter = params.filter === "new" ? "new" : "all";
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);
  const q = (params.q ?? "").slice(0, 60);

  const today = todayIn(tz);
  const monthStartIso = zonedToUtcIso(`${today.slice(0, 8)}01`, "00:00", tz);
  const [{ rows, total }, stats] = await Promise.all([
    listPatients({ clinicId, q, filter, page, monthStartIso }),
    patientStats(clinicId, monthStartIso),
  ]);
  const nowIso = new Date().toISOString();
  const summaries = await visitSummaries(
    clinicId,
    rows.map((r) => r.id),
    nowIso,
  );
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const href = (over: Record<string, string | undefined>) => {
    const next = new URLSearchParams();
    const merged = {
      q: q || undefined,
      filter: filter === "all" ? undefined : filter,
      page: page > 1 ? String(page) : undefined,
      ...over,
    };
    for (const [k, v] of Object.entries(merged)) if (v) next.set(k, v);
    const s = next.toString();
    return s ? `/patients?${s}` : "/patients";
  };

  return (
    <>
      <PageHeader
        eyebrow="Workspace"
        title="Patients"
        actions={can(membership.role, "appointments.book") ? <AddPatientDialog /> : null}
      />

      <div className="grid gap-6 sm:grid-cols-2">
        <Stat label="Total patients" value={stats.total} />
        <Stat label="New this month" value={stats.newThisMonth} />
      </div>

      {membership.role === "owner" || membership.role === "receptionist" ? <PatientImport /> : null}

      <Card className="flex flex-col gap-5 p-2 sm:p-4">
        <div className="flex flex-wrap items-center justify-between gap-3 px-2 pt-2">
          <nav aria-label="Patient filters" className="flex gap-1.5">
            {(["all", "new"] as const).map((f) => (
              <Link
                key={f}
                href={href({ filter: f === "all" ? undefined : f, page: undefined })}
                aria-current={filter === f ? "page" : undefined}
                className={cn(
                  "inline-flex min-h-11 items-center rounded-full px-4 text-sm font-medium",
                  filter === f ? "bg-ink text-surface" : "text-muted hover:text-ink",
                )}
              >
                {f === "all" ? "All" : "New"}
              </Link>
            ))}
          </nav>
          <form
            action="/patients"
            method="get"
            className="flex min-w-0 items-center gap-2 max-sm:w-full"
            role="search"
          >
            {filter === "new" ? <input type="hidden" name="filter" value="new" /> : null}
            <label className="rounded-control border-line-strong bg-surface flex min-h-11 min-w-0 items-center gap-2 border px-3 max-sm:flex-1">
              <Search className="text-muted size-4 shrink-0" aria-hidden="true" />
              <span className="sr-only">Search patients</span>
              <input
                name="q"
                defaultValue={q}
                placeholder="Name or phone"
                className="placeholder:text-muted w-full min-w-0 bg-transparent text-sm outline-none sm:w-44"
              />
            </label>
            <Button type="submit" variant="ghost">
              Search
            </Button>
          </form>
        </div>

        {rows.length === 0 ? (
          <p className="text-muted px-4 py-12 text-center">
            {q || filter === "new"
              ? "No patients match."
              : "No patients yet. Add your first patient to get started."}
          </p>
        ) : (
          <Table>
            <caption className="sr-only">Patients</caption>
            <thead>
              <tr>
                <Th>Patient</Th>
                <Th className="hidden sm:table-cell">Last visit</Th>
                <Th className="hidden sm:table-cell">Next visit</Th>
                <Th className="w-px text-right">
                  <span className="sr-only">Patient record</span>
                </Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => {
                const s = summaries.get(p.id);
                const age = p.birthdate ? ageOn(p.birthdate, today) : null;
                const meta = [age !== null ? String(age) : null, p.sex ? SEX_SHORT[p.sex] : null]
                  .filter(Boolean)
                  .join(" · ");
                return (
                  <tr key={p.id} className="hover:bg-canvas">
                    <Td className="px-2 sm:px-4">
                      <Link
                        href={`/patients/${p.id}`}
                        prefetch={false}
                        aria-label={`Open record for ${p.full_name}`}
                        className="flex min-h-11 items-center gap-3 text-left"
                      >
                        <span
                          aria-hidden="true"
                          className="bg-mint text-mint-ink flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold"
                        >
                          {initials(p.full_name)}
                        </span>
                        <span className="flex min-w-0 flex-col">
                          <span className="font-semibold wrap-anywhere">{p.full_name}</span>
                          <span className="text-muted text-xs">
                            {[
                              p.birthdate ? `DOB ${formatDateShort(p.birthdate)}` : null,
                              meta,
                              `ID ${patientIdLabel(p.patient_number)}`,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </span>
                          <span className="text-muted max-w-full truncate text-xs">
                            {[p.phone, p.email].filter(Boolean).join(" · ") || "No contact details"}
                          </span>
                        </span>
                      </Link>
                    </Td>
                    <Td className="tabular text-ink-2 hidden sm:table-cell">
                      {s?.last ? formatDateShort(dateOf(s.last, tz)) : "—"}
                    </Td>
                    <Td className="tabular text-ink-2 hidden sm:table-cell">
                      {s?.next ? formatDateShort(dateOf(s.next, tz)) : "—"}
                    </Td>
                    <Td className="px-2 text-right sm:px-4">
                      <Button asChild variant="ghost" className="px-3">
                        <Link
                          href={`/patients/${p.id}`}
                          prefetch={false}
                          aria-label={`View patient ${p.full_name}`}
                        >
                          View
                          <ChevronRight aria-hidden="true" />
                        </Link>
                      </Button>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}

        <nav
          aria-label="Patient pagination"
          className="flex flex-wrap items-center justify-between gap-3 px-2 pb-2"
        >
          <span className="tabular text-muted text-sm">
            Showing {total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1}–
            {Math.min(page * PAGE_SIZE, total)} of {total} · {PAGE_SIZE} per page
          </span>
          <div className="flex items-center gap-2">
            <Button
              asChild
              variant="ghost"
              className={page <= 1 ? "pointer-events-none opacity-50" : undefined}
            >
              <Link
                href={href({ page: page > 2 ? String(page - 1) : undefined })}
                aria-disabled={page <= 1}
                tabIndex={page <= 1 ? -1 : undefined}
              >
                Previous
              </Link>
            </Button>
            <span className="tabular text-muted text-sm">
              Page {page} of {pages}
            </span>
            <Button
              asChild
              variant="ghost"
              className={page >= pages ? "pointer-events-none opacity-50" : undefined}
            >
              <Link
                href={href({ page: String(page + 1) })}
                aria-disabled={page >= pages}
                tabIndex={page >= pages ? -1 : undefined}
              >
                Next
              </Link>
            </Button>
          </div>
        </nav>
      </Card>
    </>
  );
}
