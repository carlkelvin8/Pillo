import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { APP_NAME } from "@/config/brand";
import { ChairScene } from "./scenes/chair";
import { ControlScene } from "./scenes/control";
import { DeskScene } from "./scenes/desk";
import { FinaleScene, SoonScene } from "./scenes/finale";
import { HeroScene, MarqueeBands } from "./scenes/hero";
import { LedgerScene } from "./scenes/ledger";
import { StoryRoot } from "./story/story-root";
import "./story.css";
import "./hero.css";

const CHAPTERS = [
  { id: "hero", label: "Start" },
  { id: "chair", label: "Chair-Filler" },
  { id: "desk", label: "Front desk" },
  { id: "ledger", label: "Payment records" },
  { id: "control", label: "Control" },
  { id: "soon", label: "Coming soon" },
  { id: "finale", label: "Get started" },
] as const;

/** Scroll-driven product story. Every effect is progressive: without scripts or with reduced motion it is a normal page. */
export function Landing() {
  return (
    <StoryRoot>
      <noscript>
        <style>{`.story-scene{--p:1}.story-track{height:auto!important}.story-stage{position:relative;height:auto;min-height:100svh;padding-block:5rem}.story-hero-content,.hx-window-wrap,.hx-window{opacity:1!important;transform:none!important;filter:none!important}`}</style>
      </noscript>

      <a
        href="#main"
        className="bg-ink text-surface focus-visible:ring-mint-strong sr-only z-[70] inline-flex min-h-11 items-center rounded-control px-4 font-semibold focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus-visible:ring-2"
      >
        Skip to content
      </a>

      <header className="fixed inset-x-3 top-4 z-50 mx-auto flex max-w-6xl items-center justify-between gap-3 rounded-full border border-line bg-surface/80 py-1.5 pr-1.5 pl-4 backdrop-blur-md sm:inset-x-6">
        <Link
          href="/"
          aria-label={`${APP_NAME} home`}
          className="inline-flex min-h-11 items-center gap-2 text-lg font-semibold"
          data-cursor-label="Home"
        >
          <Logo className="[&_svg]:size-7" />
        </Link>
        <nav aria-label="Account" className="flex items-center gap-1.5">
          <Button asChild variant="ghost" className="border-transparent">
            <Link href="/login">Sign in</Link>
          </Button>
          <Button asChild className="hidden sm:inline-flex" data-magnetic="" data-cursor-label="Start">
            <Link href="/signup">Get started</Link>
          </Button>
        </nav>
      </header>

      <nav className="story-rail" aria-label="Story chapters">
        {CHAPTERS.map((chapter) => (
          <a key={chapter.id} href={`#${chapter.id}`}>
            <span>{chapter.label}</span>
            <i aria-hidden="true" />
          </a>
        ))}
      </nav>

      <main id="main">
        <HeroScene />
        <MarqueeBands />
        <ChairScene />
        <DeskScene />
        <LedgerScene />
        <ControlScene />
        <SoonScene />
        <FinaleScene />
      </main>

      <footer className="bg-ink text-faint border-t border-ink-2 px-6 py-8 text-center text-sm">
        <p>© {APP_NAME}</p>
      </footer>
    </StoryRoot>
  );
}
