"use client";

import "@fontsource-variable/plus-jakarta-sans";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { APP_NAME } from "@/config/brand";
import "./globals.css";

/**
 * Last-resort boundary: the root layout itself failed, so this renders its own <html> and <body>.
 * The error message and stack are never shown or logged (they may hold patient or clinic data).
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Unhandled root error", error.digest ?? "no-digest");
  }, [error]);

  return (
    <html lang="en">
      <body className="bg-canvas text-ink">
        <main
          role="alert"
          className="flex min-h-screen flex-col items-center justify-center gap-6 px-6 py-16 text-center"
        >
          <p className="text-card-title">{APP_NAME}</p>
          <div className="flex max-w-md flex-col gap-2">
            <h1 className="text-title">Something went wrong</h1>
            <p className="text-muted text-base">
              {APP_NAME} could not load. Try again, and if it keeps happening, contact support.
            </p>
          </div>
          <Button onClick={reset}>Try again</Button>
        </main>
      </body>
    </html>
  );
}
