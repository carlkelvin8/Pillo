import type { Metadata } from "next";
import Link from "next/link";
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
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
  calendarGrid,
  HEADER_PX,
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
import { monthBounds, monthCells, shiftMonth } from "@/features/scheduling/calendar-month";
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
  const view = params.view === "day" || params.view === "month" ? params.view : "week";

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
  const monthRange = view === "month" ? monthBounds(anchor) : null;
  const rangeStart = view === "day" ? anchor : (monthRange?.start ?? weekStart);
  const rangeEndExclusive =
    view === "day" ? addDays(anchor, 1) : (monthRange?.end ?? addDays(weekStart, 7));
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

  const visibleWeekdays = new Set(days.map(weekdayOf));
  const grid = calendarGrid(
    branchWindows.filter((w) => visibleWeekdays.has(w.weekday)),
    appointments.map((a) => ({ startsAt: a.starts_at, endsAt: a.ends_at })),
    tz,
  );

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
        const { top, height } = blockPosition(a, tz, grid);
        return {
          id: a.id,
          patientId: a.patient_id,
          patientName: names.get(a.patient_id)?.name ?? "Patient",
          doctorId: a.doctor_id,
          doctorName: doctorName.get(a.doctor_id) ?? "Doctor",
          branchId: a.branch_id,
          branchName: branchNameById.get(a.branch_id) ?? "",
          date: d,
          dateLabel: `${formatWeekday(d)} ${formatDateLong(d)}`,
          timeLabel: `${formatTime(a.starts_at, tz)} to ${formatTime(a.ends_at, tz)}`,
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
  const step = view === "day" ? 1 : view === "month" ? 0 : 7;
  const title =
    view === "day"
      ? `${WEEKDAY_NAMES[weekdayOf(anchor)]}, ${formatDateLong(anchor)}`
      : view === "month"
        ? new Intl.DateTimeFormat("en-PH", {
            month: "long",
            year: "numeric",
            timeZone: "UTC",
          }).format(new Date(`${monthRange?.start}T12:00:00Z`))
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

      <div className="grid grid-cols-[minmax(0,1fr)] items-stretch gap-6 xl:grid-cols-3">
        <Card className="flex h-full flex-col gap-4 p-5 sm:p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle>Doctors</CardTitle>
              <p className="text-muted mt-1 text-xs">Availability for this branch today</p>
            </div>
            <Chip tone="neutral">{doctors.length} active</Chip>
          </div>
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
            <ul className="max-h-72 space-y-2 overflow-y-auto overscroll-contain pr-1">
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
                  <li
                    key={d.id}
                    className="bg-canvas rounded-control flex min-w-0 flex-col gap-2 p-3"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <span
                        aria-hidden="true"
                        className="bg-mint text-mint-ink flex size-11 shrink-0 items-center justify-center rounded-full text-xs font-semibold"
                      >
                        {initials(d.display_name)}
                      </span>
                      <span className="flex min-w-0 flex-1 flex-col leading-tight">
                        <span className="truncate font-medium">{d.display_name}</span>
                        {d.specialty ? (
                          <span className="text-muted truncate text-xs">{d.specialty}</span>
                        ) : null}
                      </span>
                    </div>
                    <Chip tone={works ? "success" : "neutral"} className="ml-14 w-fit px-2.5">
                      <span
                        aria-hidden="true"
                        className={cn("size-1.5 rounded-full", works ? "bg-mint-ink" : "bg-muted")}
                      />
                      {works ? "Available today" : "Off today"}
                    </Chip>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        {canBook ? (
          <Card className="flex h-full flex-col gap-4 p-5 sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <CardTitle>Waitlist</CardTitle>
                <p className="text-muted mt-1 text-xs">Patients looking for an earlier slot</p>
              </div>
              {waitlist.length > 0 ? <Chip tone="neutral">{waitlist.length}</Chip> : null}
              <AddToWaitlistDialog doctors={doctorOptions} />
            </div>
            {waitlist.length === 0 ? (
              <p className="text-muted text-sm">Nobody is waiting for an earlier slot.</p>
            ) : (
              <ul className="max-h-72 space-y-2 overflow-y-auto overscroll-contain pr-1">
                {waitlist.map((w) => {
                  const name = waitNames.get(w.patient_id)?.name ?? "Patient";
                  const preferredDays = w.preferred_weekdays
                    .map((x) => WEEKDAY_NAMES[x]?.slice(0, 3))
                    .filter(Boolean);
                  return (
                    <li
                      key={w.id}
                      className="bg-canvas rounded-control flex min-w-0 flex-col gap-3 p-3"
                    >
                      <div className="flex min-w-0 items-start gap-3">
                        <span
                          aria-hidden="true"
                          className="bg-surface text-ink-2 flex size-10 shrink-0 items-center justify-center rounded-full text-xs font-semibold"
                        >
                          {initials(name)}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate font-semibold">{name}</p>
                          <p className="text-muted mt-0.5 truncate text-xs">
                            {[w.reason, w.doctor_id ? doctorName.get(w.doctor_id) : null]
                              .filter(Boolean)
                              .join(" · ") || "Any appointment"}
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {preferredDays.length > 0 ? (
                          preferredDays.map((day) => (
                            <Chip key={day} tone="neutral" className="bg-surface">
                              {day}
                            </Chip>
                          ))
                        ) : (
                          <span className="text-muted text-xs">Any day</span>
                        )}
                      </div>
                      <div className="border-line flex items-center justify-between gap-2 border-t pt-2">
                        <OutreachChip outreach={w.outreach_ok} consented={w.consented} />
                        <WaitlistRemoveButton entryId={w.id} name={name} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        ) : null}

        <Card className="flex flex-col gap-4 p-5 sm:p-6">
          <div>
            <CardTitle>Appointment status</CardTitle>
            <p className="text-muted mt-1 text-xs">Status key</p>
          </div>
          <ul className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            {LEGEND.map((l) => (
              <li key={l.label} className="flex min-w-0 items-center gap-2">
                <span
                  aria-hidden="true"
                  className={cn("size-3.5 shrink-0 rounded-[4px] border", l.className)}
                />
                <span className="text-ink-2 leading-snug">
                  {l.label === "Scheduled or confirmed"
                    ? "Scheduled"
                    : l.label === "Booked by Dr. Pill"
                      ? "Dr. Pill booking"
                      : l.label}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <div className="w-full">
        <Card className="flex min-w-0 flex-col gap-4 p-4 sm:p-7">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <Button asChild variant="ghost" size="icon" aria-label="Previous">
                <Link
                  href={href({
                    date: view === "month" ? shiftMonth(anchor, -1) : addDays(anchor, -step),
                  })}
                >
                  <ChevronLeft aria-hidden="true" />
                </Link>
              </Button>
              <h2 className="text-card-title text-center sm:min-w-44">{title}</h2>
              <Button asChild variant="ghost" size="icon" aria-label="Next">
                <Link
                  href={href({
                    date: view === "month" ? shiftMonth(anchor, 1) : addDays(anchor, step),
                  })}
                >
                  <ChevronRight aria-hidden="true" />
                </Link>
              </Button>
              <Button asChild variant="ghost">
                <Link href={href({ date: undefined })}>Today</Link>
              </Button>
            </div>
            <nav aria-label="View" className="flex gap-1.5">
              {(["week", "day", "month"] as const).map((v) => (
                <Link
                  key={v}
                  href={href({ view: v === "week" ? undefined : v })}
                  aria-current={view === v ? "page" : undefined}
                  className={cn(
                    "inline-flex min-h-11 items-center rounded-full px-4 text-sm font-medium",
                    view === v ? "bg-ink text-surface" : "text-muted hover:text-ink",
                  )}
                >
                  {v === "week" ? "Week" : v === "day" ? "Day" : "Month"}
                </Link>
              ))}
            </nav>
          </div>

          {branches.length > 1 || doctors.length > 1 ? (
            <form action="/appointments" method="get" className="flex flex-wrap items-end gap-3">
              {anchor !== today ? <input type="hidden" name="date" value={anchor} /> : null}
              {view !== "week" ? <input type="hidden" name="view" value={view} /> : null}
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
                  <span className="relative block w-48">
                    <Select
                      name="doctor"
                      defaultValue={doctorFilter ?? ""}
                      className="w-full appearance-none pr-11"
                    >
                      <option value="">All doctors</option>
                      {doctors.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.display_name}
                        </option>
                      ))}
                    </Select>
                    <ChevronDown
                      aria-hidden="true"
                      className="text-muted pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2"
                    />
                  </span>
                </label>
              ) : null}
              <Button type="submit" variant="ghost">
                Apply
              </Button>
            </form>
          ) : null}

          {view === "month" ? (
            <div
              className="grid grid-cols-[repeat(7,minmax(0,1fr))] gap-1 sm:gap-2"
              aria-label="Appointments by month"
            >
              {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => (
                <p key={day} className="text-muted py-1 text-center text-xs font-semibold sm:px-2">
                  {day}
                </p>
              ))}
              {monthCells(anchor).map((day, index) => {
                const count = day
                  ? appointments.filter((appointment) => dateOf(appointment.starts_at, tz) === day)
                      .length
                  : 0;
                return day ? (
                  <Link
                    key={day}
                    href={href({ date: day, view: "day" })}
                    className="border-line bg-surface hover:bg-canvas rounded-control flex min-h-24 flex-col border p-2"
                  >
                    <span className={cn("text-sm font-semibold", day === today && "text-mint-ink")}>
                      {Number(day.slice(8))}
                    </span>
                    <span className="text-muted mt-auto text-xs">
                      {count} {count === 1 ? "appointment" : "appointments"}
                    </span>
                  </Link>
                ) : (
                  <span key={`empty-${index}`} aria-hidden="true" />
                );
              })}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <div className="flex" style={{ minWidth: days.length * 120 + 64 }}>
                <div className="w-16 shrink-0" style={{ paddingTop: HEADER_PX }} aria-hidden="true">
                  {grid.rows.map(({ hour, height }) => (
                    <div
                      key={hour}
                      className="text-muted pt-1 pr-3 text-right text-xs"
                      style={{ height }}
                    >
                      {hourLabel(hour)}
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
                          style={{ height: grid.height }}
                        >
                          {grid.rows.map(({ hour, height }) => (
                            <div key={hour} className="border-subtle border-t" style={{ height }} />
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
          )}
        </Card>
      </div>
    </>
  );
}
