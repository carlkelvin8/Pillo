/** The clinic the signed-in user is working in. Collapses to just the logo/initial badge in the compact sidebar. */
export function ClinicIdentity({
  clinicName,
  logoUrl = null,
}: {
  clinicName: string;
  logoUrl?: string | null;
}) {
  const initial = clinicName.trim().charAt(0).toUpperCase() || "C";
  return (
    <div
      role="group"
      aria-label="Clinic workspace"
      className="sidebar-clinic-context border-line bg-subtle rounded-card flex min-w-0 items-center gap-3 border px-3 py-3"
    >
      <span
        aria-hidden="true"
        className="sidebar-clinic-badge bg-mint text-mint-ink rounded-control flex size-10 shrink-0 items-center justify-center overflow-hidden text-base font-semibold"
      >
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- owner-uploaded logo, size-limited
          <img src={logoUrl} alt="" className="size-full object-cover" />
        ) : (
          initial
        )}
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
