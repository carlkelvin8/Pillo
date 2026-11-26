"use client";

import { useEffect } from "react";
import { DrPillAvatar } from "@/components/brand/dr-pill-avatar";
import { Button } from "@/components/ui/button";

/** Root error boundary: something threw while rendering. The message is never shown (it may hold data). */
export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Only the digest: the message could contain patient or clinic data.
    console.error("Unhandled render error", error.digest ?? "no-digest");
  }, [error]);

  return (
    <main
      role="alert"
      className="bg-canvas flex min-h-screen flex-col items-center justify-center gap-6 px-6 py-16 text-center"
    >
      <DrPillAvatar mood="sleepy" size={96} />
      <div className="flex max-w-md flex-col gap-2">
        <h1 className="text-title">Something went wrong</h1>
        <p className="text-muted text-base">
          We could not show this page. Try again, and if it keeps happening, contact support.
        </p>
      </div>
      <Button onClick={reset}>Try again</Button>
    </main>
  );
}
