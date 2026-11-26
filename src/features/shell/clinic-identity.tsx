/** The clinic the signed-in user is working in. Collapses to just the initial badge in the compact sidebar. */
export function ClinicIdentity({ clinicName }: { clinicName: string }) {
  const initial = clinicName.trim().charAt(0).toUpperCase() || "C";
  return (
    <div
      role="group"
      aria-label="Clinic workspace"
      className="sidebar-clinic-context border-line bg-subtle rounded-card flex min-w-0 items-center gap-3 border px-3 py-3"
    >
      <span
        aria-hidden="true"
        className="sidebar-clinic-badge bg-mint text-mint-ink rounded-control flex size-10 shrink-0 items-center justify-center text-base font-semibold"
      >
        {initial}
      </span>
      <span className="sidebar-clinic-copy flex min-w-0 flex-col gap-1">
        <span className="text-muted text-[11px] leading-none font-semibold tracking-[0.08em]">
          CURRENT CLINIC
        </span>
        <span
          className="text-ink line-clamp-2 text-sm leading-snug font-semibold"
          title={clinicName}
        >
          {clinicName}
        </span>
      </span>
    </div>
  );
}
