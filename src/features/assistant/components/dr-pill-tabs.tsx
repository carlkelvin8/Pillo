import Link from "next/link";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/dr-pill", key: "conversations", label: "Conversations" },
  { href: "/dr-pill/activity", key: "activity", label: "Activity" },
  { href: "/dr-pill/ask", key: "ask", label: "Ask Dr. Pill", ownerOnly: true },
] as const;

export function DrPillTabs({
  active,
  isOwner,
}: {
  active: "conversations" | "activity" | "ask";
  isOwner: boolean;
}) {
  return (
    <nav aria-label="Dr. Pill sections" className="-mt-4 flex flex-wrap gap-1.5">
      {TABS.filter((t) => !("ownerOnly" in t) || isOwner).map((t) => (
        <Link
          key={t.key}
          href={t.href}
          aria-current={t.key === active ? "page" : undefined}
          className={cn(
            "inline-flex min-h-11 items-center rounded-full px-4 text-sm font-medium",
            t.key === active ? "bg-ink text-surface" : "text-muted hover:text-ink",
          )}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
