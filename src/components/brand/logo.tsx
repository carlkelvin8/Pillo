import { APP_NAME } from "@/config/brand";
import { cn } from "@/lib/utils";

/**
 * Pillo mark (the app icon: two capsules on ink) + product name. The name always comes from APP_NAME.
 * The colors here are the brand tokens (ink, white, mint-strong) written as CSS variables.
 */
export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <svg aria-hidden="true" viewBox="0 0 512 512" className="size-8 shrink-0">
        <rect width="512" height="512" rx="112.64" fill="var(--color-ink)" />
        <g transform="translate(256 256) rotate(28)">
          <rect
            x="-110.08"
            y="-122.88"
            width="97.28"
            height="296.96"
            rx="48.64"
            fill="var(--color-surface)"
          />
          <rect
            x="12.8"
            y="-174.08"
            width="97.28"
            height="296.96"
            rx="48.64"
            fill="var(--color-mint-strong)"
          />
        </g>
      </svg>
      <span className="text-[19px] font-bold tracking-tight">{APP_NAME}</span>
    </span>
  );
}
