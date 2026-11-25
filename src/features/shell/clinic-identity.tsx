export function ClinicIdentity({ clinicName }: { clinicName: string }) {
  return (
    <div
      role="group"
      aria-label="Clinic workspace"
      className="sidebar-clinic-context border-line bg-subtle rounded-card mx-1 flex min-w-0 items-start gap-3 border px-3 py-3"
    >
      <span className="flex min-w-0 flex-col gap-1 pt-0.5">
        <span className="text-muted text-[10px] leading-none font-semibold tracking-[0.08em]">
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
