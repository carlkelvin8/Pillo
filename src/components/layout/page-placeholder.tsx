import { DrPillAvatar } from "@/components/brand/dr-pill-avatar";
import { Card } from "@/components/ui/card";
import { PageHeader } from "./page-header";

type PagePlaceholderProps = { title: string; phase: number; description: string };

/** Empty state for screens that arrive in a later build phase. */
export function PagePlaceholder({ title, phase, description }: PagePlaceholderProps) {
  return (
    <>
      <PageHeader title={title} />
      <Card className="flex flex-col items-center gap-4 py-16 text-center">
        <DrPillAvatar mood="happy" size={96} decorative />
        <h2 className="text-card-title">Coming in Phase {phase}</h2>
        <p className="text-muted max-w-md">{description}</p>
      </Card>
    </>
  );
}
