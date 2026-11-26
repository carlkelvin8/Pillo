import type { Metadata } from "next";
import Link from "next/link";
import { DrPillAvatar } from "@/components/brand/dr-pill-avatar";
import { buttonVariants } from "@/components/ui/button";

export const metadata: Metadata = { title: "Page not found" };

/** Shown for any unknown URL. Plain and public: it must not depend on a session. */
export default function NotFound() {
  return (
    <main className="bg-canvas flex min-h-screen flex-col items-center justify-center gap-6 px-6 py-16 text-center">
      <DrPillAvatar mood="think" size={96} />
      <div className="flex max-w-md flex-col gap-2">
        <h1 className="text-title">Page not found</h1>
        <p className="text-muted text-base">
          That page does not exist or has moved. Check the address, or head back to your dashboard.
        </p>
      </div>
      <Link href="/dashboard" className={buttonVariants({ variant: "primary" })}>
        Go to dashboard
      </Link>
    </main>
  );
}
