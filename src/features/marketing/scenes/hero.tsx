import Link from "next/link";
import {
  ArrowDown,
  ArrowRight,
  Bell,
  CalendarDays,
  CheckCircle2,
  FileText,
  LayoutDashboard,
  MessageCircle,
  Search,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { APP_NAME, ASSISTANT_NAME } from "@/config/brand";
import { MascotSpot, Scene, vars } from "./shared";

function Word({ i, children }: { i: number; children: string }) {
  return (
    <>
      <span className="story-mask">
        <span className="story-mask-in" style={vars({ "--i": i })}>
          {children}
        </span>
      </span>{" "}
    </>
  );
}

type NavItem = { icon: LucideIcon; label: string; active?: boolean };
const NAV: { label: string; items: NavItem[] }[] = [
  {
    label: "Workspace",
    items: [
      { icon: LayoutDashboard, label: "Dashboard" },
      { icon: CalendarDays, label: "Appointments", active: true },
      { icon: Users, label: "Patients" },
    ],
  },
  {
    label: "Money",
    items: [
      { icon: Wallet, label: "Payment records" },
      { icon: FileText, label: "Invoices" },
    ],
  },
  { label: "Assistant", items: [{ icon: MessageCircle, label: ASSISTANT_NAME }] },
];

/** Sample day view (illustration). t = hours after 9:00, l = length in hours. */
const HOURS = ["9 AM", "10 AM", "11 AM", "12 PM", "1 PM", "2 PM", "3 PM"];
type Block = { t: number; l: number; what?: string; who?: string; tone?: "ok" | "wait"; live?: boolean };
const COLUMNS: { doctor: string; blocks: Block[] }[] = [
  {
    doctor: "Dr. Cruz",
    blocks: [
      { t: 0, l: 0.75, what: "Cleaning", who: "AB", tone: "ok" },
      { t: 1.5, l: 0.75, live: true },
      { t: 3.5, l: 1, what: "Filling", who: "LT", tone: "wait" },
      { t: 5.25, l: 0.75, what: "Cleaning", who: "DC", tone: "ok" },
    ],
  },
  {
    doctor: "Dr. Reyes",
    blocks: [
      { t: 0.5, l: 1, what: "Consultation", who: "RM", tone: "ok" },
      { t: 2, l: 1, what: "Braces adjustment", who: "CV", tone: "ok" },
      { t: 4.25, l: 1.25, what: "Root canal", who: "JP", tone: "ok" },
    ],
  },
  {
    doctor: "Dr. Lim",
    blocks: [
      { t: 0, l: 1.25, what: "Check-up", who: "TG", tone: "ok" },
      { t: 2.25, l: 0.75, what: "Cleaning", who: "HS", tone: "ok" },
      { t: 3.5, l: 0.75, what: "Check-up", who: "AM", tone: "wait" },
      { t: 5, l: 1, what: "Filling", who: "BS", tone: "ok" },
    ],
  },
];

export function HeroScene() {
  return (
    <Scene id="hero" label="Start" len={190} tone="dark" className="story-hero-scene hx">
      <div className="hx-lines" aria-hidden="true" />

      <div className="hx-copy story-hero-content">
        <p className="hx-eyebrow">
          <span aria-hidden="true" />
          Made for clinics in the Philippines
          <span aria-hidden="true" />
        </p>
        <h1 id="hero-title" className="hx-title">
          <span className="block">
            <Word i={0}>Fill</Word>
            <Word i={1}>your</Word>
            <Word i={2}>empty</Word>
            <Word i={3}>chairs.</Word>
          </span>
          <span className="hx-title-soft block">
            <Word i={4}>Run</Word>
            <Word i={5}>your</Word>
            <Word i={6}>clinic</Word>
            <Word i={7}>with</Word>
            <Word i={8}>less</Word>
            <Word i={9}>typing.</Word>
          </span>
        </h1>
        <p className="hx-sub">
          {APP_NAME} is a supervised AI front desk with appointments, patient records and a payment
          logbook in one place. {ASSISTANT_NAME} drafts the work. Your staff approve it.
        </p>
        <div className="hx-cta">
          <Button asChild variant="mint" className="hx-primary" data-magnetic="" data-cursor-label="Start">
            <Link href="/signup">
              Create your clinic <ArrowRight aria-hidden="true" />
            </Link>
          </Button>
          <a href="#chair" className="hx-link" data-cursor-label="Watch">
            See how it works <ArrowDown aria-hidden="true" />
          </a>
        </div>
        <p className="hx-note">Free during early access.</p>
      </div>

      <div className="hx-stage">
        <div className="hx-window-wrap">
          <MascotSpot mood="happy" className="hx-spot" />
          <div className="hx-window" aria-hidden="true">
            <div className="hx-side">
              <div className="hx-clinic">
                <span className="hx-clinic-badge">D</span>
                <span className="flex min-w-0 flex-col leading-tight">
                  <small>CURRENT CLINIC</small>
                  <b>Dental Clinic</b>
                </span>
              </div>
              {NAV.map((group) => (
                <div key={group.label} className="hx-nav-group">
                  <small>{group.label}</small>
                  {group.items.map((item) => (
                    <span key={item.label} className={item.active ? "hx-nav is-active" : "hx-nav"}>
                      <item.icon aria-hidden="true" />
                      {item.label}
                    </span>
                  ))}
                </div>
              ))}
            </div>

            <div className="hx-main">
              <div className="hx-top">
                <span className="hx-search">
                  <Search aria-hidden="true" /> Search patients or INV number
                </span>
                <span className="hx-bell">
                  <Bell aria-hidden="true" />
                  <i />
                </span>
                <span className="hx-avatar">QA</span>
              </div>
              <div className="hx-head">
                <span className="flex flex-col leading-tight">
                  <small>Thursday, November 26</small>
                  <b>Appointments</b>
                </span>
                <span className="hx-seg">
                  <i className="is-on">Day</i>
                  <i>Week</i>
                </span>
                <span className="hx-new">New appointment</span>
                <span className="story-sample hx-sample">Sample data</span>
              </div>
              <div className="hx-cal">
                <div className="hx-gutter">
                  {HOURS.map((h) => (
                    <span key={h}>{h}</span>
                  ))}
                </div>
                {COLUMNS.map((col) => (
                  <div key={col.doctor} className="hx-col">
                    <p className="hx-doc">{col.doctor}</p>
                    <div className="hx-track">
                      {col.blocks.map((block, i) =>
                        block.live ? (
                          <div key={i} className="hx-blk hx-live" style={vars({ "--t": block.t, "--l": block.l })}>
                            <span className="hx-bg hx-bg-ok" />
                            <span className="hx-bg hx-bg-bad" />
                            <span className="hx-bg hx-bg-open" />
                            <span className="hx-bg hx-bg-new" />
                            <span className="hx-blk-text">
                              <b className="hx-l-a">Check-up · MS</b>
                              <b className="hx-l-b">Open slot</b>
                              <b className="hx-l-c">Check-up · JD</b>
                            </span>
                            <span className="hx-tag">Cancelled</span>
                          </div>
                        ) : (
                          <div
                            key={i}
                            className={`hx-blk hx-blk-${block.tone}`}
                            style={vars({ "--t": block.t, "--l": block.l })}
                          >
                            <span className="hx-blk-text">
                              <b>
                                {block.what} · {block.who}
                              </b>
                            </span>
                          </div>
                        ),
                      )}
                    </div>
                  </div>
                ))}
              </div>
              <div className="hx-toast">
                <CheckCircle2 aria-hidden="true" />
                <span className="flex flex-col leading-tight">
                  <b>Slot refilled</b>
                  <small>Offer accepted from the waitlist</small>
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Scene>
  );
}

const BAND = [
  "Appointments",
  "Patient records",
  "Invoices",
  "Payment records",
  "Chair-Filler",
  `${ASSISTANT_NAME}`,
  "Branches",
  "Audit log",
];

/** Two bands that slide sideways as you scroll, one each way. Decorative. */
export function MarqueeBands() {
  const row = [...BAND, ...BAND, ...BAND];
  return (
    <div data-scene="bands" data-passive="" className="story-scene story-bands" aria-hidden="true">
      <div className="story-band story-band-a">
        <div className="story-band-track">
          {row.map((item, i) => (
            <span key={`${item}-${i}`}>
              {item}
              <i />
            </span>
          ))}
        </div>
      </div>
      <div className="story-band story-band-b">
        <div className="story-band-track">
          {row.map((item, i) => (
            <span key={`${item}-${i}`}>
              {item}
              <i />
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
