import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { Select } from "@/components/ui/input";
import { can } from "@/features/auth/permissions";
import { requireCapability } from "@/features/auth/workspace";
import { patientNames } from "@/features/patients/queries";
import {
  AppointmentBlock,
  type BlockData,
  type BlockVariant,
} from "@/features/scheduling/components/appointment-block";
import { NewAppointmentDialog } from "@/features/scheduling/components/new-appointment-dialog";
import {
  AddToWaitlistDialog,
  OutreachChip,
  WaitlistRemoveButton,
} from "@/features/scheduling/components/waitlist";
import {
  assignLanes,
  blockPosition,
  gridRange,
  HEADER_PX,
  HOUR_PX,
} from "@/features/scheduling/calendar-layout";
import {
  listAppointments,
  listBranches,
  listClinicHours,
  listDoctorHours,
  listDoctors,
  listWaitlist,
  toBranchWindows,
} from "@/features/scheduling/queries";
import { doctorWorksOn, upcomingOpenDates } from "@/features/scheduling/slots";
import {
  isDateString,
  addDays,
  dateOf,
  dayBoundsUtc,
  formatDateLong,
  formatTime,
  formatWeekday,
  formatWeekRange,
  startOfWeek,
  todayIn,
  weekdayOf,
} from "@/lib/datetime";
import { initials } from "@/lib/initials";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Appointments" };

type Props = {
  searchParams: Promise<{ date?: string; view?: string; branch?: string; doctor?: string }>;
};

const hourLabel = (h: number) =>
  `${h % 12 === 0 ? 12 : h % 12} ${h < 12 || h === 24 ? "AM" : "PM"}`;
const WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

const LEGEND: { label: string; className: string }[] = [
  { label: "In progress", className: "bg-ink border-ink" },
  { label: "Scheduled or confirmed", className: "bg-canvas border-line-strong" },
  { label: "Booked by Dr. Pill", className: "bg-mint border-mint" },
  { label: "Completed", className: "bg-neutral-chip border-line-strong" },
  { label: "No-show", className: "bg-danger-chip border-danger-chip" },
];

export default async function AppointmentsPage({ searchParams }: Props) {
  const { membership } = await requireCapability("schedule.view");
  const params = await searchParams;
  const clinicId = membership.clinic.id;
  const tz = membership.clinic.timezone;
  const canBook = can(membership.role, "appointments.book");
  const canSetup = can(membership.role, "staff.manage");

  const today = todayIn(tz);
  const anchor = params.date && isDateString(params.date) ? params.date : today;
  const view = params.view === "day" ? "day" : "week";

  const [branches, doctors, allHours, doctorHours] = await Promise.all([
    listBranches(clinicId),
    listDoctors(clinicId, { activeOnly: true }),
    listClinicHours(clinicId),
    listDoctorHours(clinicId),
  ]);
  const branch = branches.find((b) => b.id === params.branch) ?? branches[0];
  const doctorFilter = doctors.find((d) => d.id === params.doctor)?.id;
  const branchWindows = branch ? toBranchWindows(allHours, branch.id) : [];

  const weekStart = startOfWeek(anchor);
  const rangeStart = view === "day" ? anchor : weekStart;
  const rangeEndExclusive = view === "day" ? addDays(anchor, 1) : addDays(weekStart, 7);
  const { start: fromIso } = dayBoundsUtc(rangeStart, tz);
  const { start: toIso } = dayBoundsUtc(rangeEndExclusive, tz);

  const appointments = branch
    ? (await listAppointments(clinicId, { fromIso, toIso, branchId: branch.id })).filter(
        (a) => !doctorFilter || a.doctor_id === doctorFilter,
      )
    : [];

  const [names, waitlist] = await Promise.all([
    patientNames(
      clinicId,
      appointments.map((a) => a.patient_id),
    ),
    canBook ? listWaitlist(clinicId) : Promise.resolve([]),
  ]);
  const waitNames = canBook
    ? await patientNames(
        clinicId,
        waitlist.map((w) => w.patient_id),
      )
    : new Map();

  // Days to show: Mon-Fri by default, plus weekend days when open or when they hold appointments.
  const allDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const busyDates = new Set(appointments.map((a) => dateOf(a.starts_at, tz)));
  const days =
    view === "day"
      ? [anchor]
      : allDays.filter((d) => {
          const wd = weekdayOf(d);
          return (
            (wd >= 1 && wd <= 5) || branchWindows.some((w) => w.weekday === wd) || busyDates.has(d)
          );
        });

  const { startHour, endHour } = gridRange(
    branchWindows.map((w) => ({ start: w.start, end: w.end })),
    appointments.map((a) => ({ startsAt: a.starts_at, endsAt: a.ends_at })),
    tz,
  );
  const hours = Array.from({ length: endHour - startHour }, (_, i) => startHour + i);

  const doctorName = new Map(doctors.map((d) => [d.id, d.display_name]));
  const nowMs = Date.now();
  const openDatesByBranch: Record<string, string[]> = {};
  for (const b of branches)
    openDatesByBranch[b.id] = upcomingOpenDates(today, toBranchWindows(allHours, b.id), 6);
  const branchNameById = new Map(branches.map((b) => [b.id, b.name]));

  const variantOf = (a: (typeof appointments)[number]): BlockVariant => {
    if (a.status === "no_show") return "noshow";
    if (a.status === "completed") return "done";
    if (a.source === "ai") return "ai";
    const s = new Date(a.starts_at).getTime();
    const e = new Date(a.ends_at).getTime();
    return nowMs >= s && nowMs < e ? "progress" : "default";
  };

  const blocksByDay = new Map<string, BlockData[]>();
  for (const d of days) {
    const dayAppts = appointments
      .filter((a) => dateOf(a.starts_at, tz) === d)
      .map((a) => ({ ...a, startsAt: a.starts_at, endsAt: a.ends_at }));
    const laned = assignLanes(dayAppts);
    blocksByDay.set(
      d,
      laned.map((a) => {
        const { top, height } = blockPosition(a.starts_at, a.ends_at, tz, startHour);
        return {
          id: a.id,
          patientId: a.patient_id,
          patientName: names.get(a.patient_id)?.name ?? "Patient",
          doctorId: a.doctor_id,
          doctorName: doctorName.get(a.doctor_id) ?? "Doctor",
          branchId: a.branch_id,
          branchName: branchNameById.get(a.branch_id) ?? "",
          dateLabel: `${formatWeekday(d)} ${formatDateLong(d)}`,
          timeLabel: `${formatTime(a.starts_at, tz)} – ${formatTime(a.ends_at, tz)}`,
          durationMin: Math.round(
            (new Date(a.ends_at).getTime() - new Date(a.starts_at).getTime()) / 60_000,
          ),
          reason: a.reason,
          status: a.status,
          source: a.source,
          variant: variantOf(a),
          top,
          height,
          lane: a.lane,
          lanes: a.lanes,
          canEdit: canBook,
          openDates: openDatesByBranch[a.branch_id] ?? [],
          tz,
        };
      }),
    );
  }

  const href = (over: Record<string, string | undefined>) => {
    const q = new URLSearchParams();
    const merged = {
      date: anchor === today ? undefined : anchor,
      view: view === "week" ? undefined : view,
      branch: branch && branches.length > 1 ? branch.id : undefined,
      doctor: doctorFilter,
      ...over,
    };
    for (const [k, v] of Object.entries(merged)) if (v) q.set(k, v);
    const s = q.toString();
    return s ? `/appointments?${s}` : "/appointments";
  };
  const step = view === "day" ? 1 : 7;
  const title =
    view === "day"
      ? `${WEEKDAY_NAMES[weekdayOf(anchor)]}, ${formatDateLong(anchor)}`
      : formatWeekRange(days[0] ?? weekStart, days[days.length - 1] ?? weekStart);

  const doctorOptions = doctors.map((d) => ({
    id: d.id,
    name: d.display_name,
    specialty: d.specialty,
  }));
  const hasHours = branchWindows.length > 0;

  return (
    <>
      <PageHeader
        eyebrow="Workspace"
        title="Appointments"
        actions={
          canBook && branch ? (
            <NewAppointmentDialog
              doctors={doctorOptions}
              branches={branches.map((b) => ({ id: b.id, name: b.name }))}
              defaultBranchId={branch.id}
              openDatesByBranch={openDatesByBranch}
              tz={tz}
              canSetup={canSetup}
            />
          ) : null
        }
      />

      {!hasHours ? (
        <p role="status" className="rounded-card bg-amber-chip text-amber-chip-ink p-4">
          {canSetup ? (
            <>
              No opening hours are set for {branch?.name ?? "this branch"} yet, so no times can be
              booked.{" "}
              <Link href="/settings/branches" className="font-semibold underline">
                Set clinic hours
              </Link>
            </>
          ) : (
            "No opening hours are set yet. Ask the clinic owner to set them."
          )}
        </p>
      ) : null}

      <div className="grid items-start gap-6 xl:grid-cols-[1fr_300px]">
        <Card className="flex flex-col gap-4 p-4 sm:p-7">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Button asChild variant="ghost" size="icon" aria-label="Previous">
                <Link href={href({ date: addDays(anchor, -step) })}>
                  <ChevronLeft aria-hidden="true" />
                </Link>
              </Button>
              <h2 className="text-card-title min-w-44 text-center">{title}</h2>
              <Button asChild variant="ghost" size="icon" aria-label="Next">
                <Link href={href({ date: addDays(anchor, step) })}>
                  <ChevronRight aria-hidden="true" />
                </Link>
              </Button>
              <Button asChild variant="ghost">
                <Link href={href({ date: undefined })}>Today</Link>
              </Button>
            </div>
            <nav aria-label="View" className="flex gap-1.5">
              {(["week", "day"] as const).map((v) => (
                <Link
                  key={v}
                  href={href({ view: v === "week" ? undefined : v })}
                  aria-current={view === v ? "page" : undefined}
                  className={cn(
                    "inline-flex min-h-11 items-center rounded-full px-4 text-sm font-medium",
                    view === v ? "bg-ink text-surface" : "text-muted hover:text-ink",
                  )}
                >
                  {v === "week" ? "Week" : "Day"}
                </Link>
              ))}
            </nav>
          </div>

          {branches.length > 1 || doctors.length > 1 ? (
            <form action="/appointments" method="get" className="flex flex-wrap items-end gap-3">
              {anchor !== today ? <input type="hidden" name="date" value={anchor} /> : null}
              {view === "day" ? <input type="hidden" name="view" value="day" /> : null}
              {branches.length > 1 ? (
                <label className="text-muted flex flex-col gap-1 text-xs">
                  Branch
                  <Select name="branch" defaultValue={branch?.id} className="w-48">
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </Select>
                </label>
              ) : null}
              {doctors.length > 1 ? (
                <label className="text-muted flex flex-col gap-1 text-xs">
                  Doctor
                  <Select name="doctor" defaultValue={doctorFilter ?? ""} className="w-48">
                    <option value="">All doctors</option>
                    {doctors.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.display_name}
                      </option>
                    ))}
                  </Select>
                </label>
              ) : null}
              <Button type="submit" variant="ghost">
                Apply
              </Button>
            </form>
          ) : null}

          <div className="overflow-x-auto">
            <div className="flex" style={{ minWidth: days.length * 120 + 64 }}>
              <div className="w-16 shrink-0" style={{ paddingTop: HEADER_PX }} aria-hidden="true">
                {hours.map((h) => (
                  <div
                    key={h}
                    className="text-muted pt-1 pr-3 text-right text-xs"
                    style={{ height: HOUR_PX }}
                  >
                    {hourLabel(h)}
                  </div>
                ))}
              </div>
              <div className="flex min-w-0 flex-1">
                {days.map((d) => {
                  const closed = !branchWindows.some((w) => w.weekday === weekdayOf(d));
                  return (
                    <section
                      key={d}
                      aria-label={`${formatWeekday(d)} ${Number(d.slice(8))}`}
                      className="border-subtle min-w-0 flex-1 border-l"
                    >
                      <div
                        className={cn(
                          "flex items-center justify-center text-sm font-medium",
                          d === today ? "text-ink" : "text-muted",
                        )}
                        style={{ height: HEADER_PX }}
                      >
                        <span
                          className={cn(
                            "rounded-full px-3 py-1",
                            d === today && "bg-mint text-mint-ink",
                          )}
                        >
                          {formatWeekday(d)} {Number(d.slice(8))}
                        </span>
                      </div>
                      <div
                        className={cn("relative", closed && "bg-canvas")}
                        style={{ height: hours.length * HOUR_PX }}
                      >
                        {hours.map((h) => (
                          <div
                            key={h}
                            className="border-subtle border-t"
                            style={{ height: HOUR_PX }}
                          />
                        ))}
                        {closed ? (
                          <span className="text-muted absolute inset-x-0 top-3 text-center text-xs">
                            Closed
                          </span>
                        ) : null}
                        {(blocksByDay.get(d) ?? []).map((block) => (
                          <AppointmentBlock key={block.id} block={block} />
                        ))}
                      </div>
                    </section>
                  );
                })}
              </div>
            </div>
          </div>
        </Card>

        <div className="flex flex-col gap-6">
          <Card className="flex flex-col gap-4 p-6">
            <CardTitle>Doctors</CardTitle>
            {doctors.length === 0 ? (
              <p className="text-muted text-sm">
                No doctors yet.{" "}
                {canSetup ? (
                  <Link href="/settings/doctors" className="text-ink font-medium underline">
                    Add a doctor
                  </Link>
                ) : null}
              </p>
            ) : (
              <ul className="flex flex-col gap-3">
                {doctors.map((d) => {
                  const works = branch
                    ? doctorWorksOn(
                        today,
                        branchWindows,
                        doctorHours
                          .filter((h) => h.doctor_id === d.id && h.branch_id === branch.id)
                          .map((h) => ({ weekday: h.weekday, start: h.starts_at, end: h.ends_at })),
                      )
                    : false;
                  return (
                    <li key={d.id} className="flex items-center gap-3">
                      <span
                        aria-hidden="true"
                        className="bg-mint text-mint-ink flex size-10 shrink-0 items-center justify-center rounded-full text-xs font-semibold"
                      >
                        {initials(d.display_name)}
                      </span>
                      <span className="flex min-w-0 flex-1 flex-col leading-tight">
                        <span className="truncate font-medium">{d.display_name}</span>
                        {d.specialty ? (
                          <span className="text-muted truncate text-xs">{d.specialty}</span>
                        ) : null}
                      </span>
                      <Chip tone={works ? "success" : "neutral"}>
                        {works ? "Available" : "Off today"}
                      </Chip>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          {canBook ? (
            <Card className="flex flex-col gap-4 p-6">
              <div className="flex items-center justify-between gap-3">
                <CardTitle>Waitlist</CardTitle>
                <AddToWaitlistDialog doctors={doctorOptions} />
              </div>
              {waitlist.length === 0 ? (
                <p className="text-muted text-sm">Nobody is waiting for an earlier slot.</p>
              ) : (
                <ul className="divide-line flex flex-col divide-y">
                  {waitlist.map((w) => {
                    const name = waitNames.get(w.patient_id)?.name ?? "Patient";
                    return (
                      <li key={w.id} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate font-semibold">{name}</p>
                            <p className="text-muted truncate text-xs">
                              {[
                                w.reason,
                                w.doctor_id ? doctorName.get(w.doctor_id) : null,
                                w.preferred_weekdays.length
                                  ? w.preferred_weekdays
                                      .map((x) => WEEKDAY_NAMES[x]?.slice(0, 3))
                                      .join(", ")
                                  : null,
                              ]
                                .filter(Boolean)
                                .join(" · ") || "Any time"}
                            </p>
                          </div>
                          <WaitlistRemoveButton entryId={w.id} name={name} />
                        </div>
                        <div>
                          <OutreachChip ok={w.outreach_ok} />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
          ) : null}

          <Card className="flex flex-col gap-3 p-6">
            <CardTitle>Legend</CardTitle>
            <ul className="flex flex-col gap-2.5 text-sm">
              {LEGEND.map((l) => (
                <li key={l.label} className="flex items-center gap-2.5">
                  <span
                    aria-hidden="true"
                    className={cn("size-3.5 rounded-[5px] border", l.className)}
                  />
                  {l.label}
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}
