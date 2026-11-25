import Link from "next/link";
import { DrPillAvatar } from "@/components/brand/dr-pill-avatar";
import { Button } from "@/components/ui/button";
import { APP_NAME } from "@/config/brand";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center gap-6 px-6 text-center">
      <DrPillAvatar mood="happy" size={128} />
      <h1 className="text-title">{APP_NAME}</h1>
      <p className="text-muted">Phase 0 scaffold. The product screens arrive in later phases.</p>
      <Button asChild>
        <Link href="/styleguide">Open the styleguide</Link>
      </Button>
    </main>
  );
}
