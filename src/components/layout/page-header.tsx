import type { ReactNode } from "react";

type PageHeaderProps = { eyebrow?: string; title: string; actions?: ReactNode };

export function PageHeader({ eyebrow, title, actions }: PageHeaderProps) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        {eyebrow ? <span className="text-muted text-[13px]">{eyebrow}</span> : null}
        <h1 className="text-title mt-2">{title}</h1>
      </div>
      {actions ? <div className="flex flex-wrap gap-3">{actions}</div> : null}
    </div>
  );
}
