"use client";

import { useEffect, useRef, type ReactNode } from "react";

/** Keeps the newest message in view when a staff member opens a conversation. */
export function MessageThread({
  children,
  messageCount,
}: {
  children: ReactNode;
  messageCount: number;
}) {
  const viewport = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = viewport.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [messageCount]);

  return (
    <div
      ref={viewport}
      className="bg-subtle rounded-card min-h-0 flex-1 overflow-y-auto scroll-smooth p-4"
    >
      {children}
    </div>
  );
}
