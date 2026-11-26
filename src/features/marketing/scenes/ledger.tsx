import { Lock } from "lucide-react";
import { at, Chapter, MascotSpot, Scene, Words } from "./shared";

/** Sample entries (illustration). */
const ENTRIES = [
  { no: "INV-0012", method: "Cash", amount: "₱1,500.00", s: 0.1 },
  { no: "INV-0013", method: "GCash", amount: "₱2,200.00", s: 0.22 },
  { no: "INV-0014", method: "Bank transfer", amount: "₱5,000.00", s: 0.34 },
  { no: "INV-0015", method: "Maya", amount: "₱850.00", s: 0.46 },
];

const ONLINE = ["GCash", "QR Ph", "Maya", "Cards"];

export function LedgerScene() {
  return (
    <Scene id="ledger" label="Payment records" len={360} tone="mint">
      <div className="mx-auto grid w-full max-w-6xl items-center gap-6 px-6 pt-16 lg:grid-cols-[1.05fr_1fr] lg:gap-16">
        <div className="relative order-2 lg:order-1">
          <MascotSpot
            mood="wink"
            rotate={10}
            className="absolute -bottom-9 -left-3 z-10 w-14 sm:-bottom-16 sm:-left-12 sm:w-24"
          />
          <div className="story-card" data-tilt="">
            <div className="flex items-center justify-between gap-3 pb-3">
              <p className="text-sm font-semibold">Payment records</p>
              <span className="story-sample">Sample data</span>
            </div>
            <ul className="divide-line flex flex-col divide-y">
              {ENTRIES.map((entry) => (
                <li key={entry.no} className="story-ledger-row fx fx-up" style={at(entry.s, 0.1, { "--dy": "1.4rem" })}>
                  <span className="min-w-0 flex-1">
                    <span className="tabular block text-sm font-semibold">{entry.no}</span>
                    <span className="text-muted block text-xs">{entry.method}</span>
                  </span>
                  <span className="tabular font-semibold">{entry.amount}</span>
                </li>
              ))}
            </ul>
            <div className="story-total fx fx-up" style={at(0.6, 0.1, { "--dy": "1rem" })}>
              <span className="text-sm font-medium">Recorded this month</span>
              <span className="tabular text-2xl font-semibold">₱9,550.00</span>
              <span className="story-stamp" aria-hidden="true">
                Recorded
              </span>
            </div>
          </div>
        </div>

        <div className="order-1 flex flex-col gap-5 lg:order-2 lg:gap-7">
          <Chapter n="03" label="Payment records" />
          <h2 id="ledger-title" className="story-h2">
            <Words text="Your payment logbook. Nothing to chase." start={0} length={0.2} />
          </h2>
          <p className="text-ink-2 max-w-md text-base fx fx-up" style={at(0.14, 0.1)}>
            Record cash, bank, GCash and Maya payments against each invoice. See what the clinic
            collected, day by day.
          </p>
          <div className="story-online fx fx-up" style={at(0.56, 0.1)}>
            <p className="text-sm font-semibold">Online payments</p>
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {ONLINE.map((name, i) => (
                <li key={name} className="story-lock fx fx-pop" style={at(0.64 + i * 0.05, 0.06)}>
                  <Lock aria-hidden="true" />
                  <span className="font-semibold">{name}</span>
                  <span className="text-xs">Coming soon</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </Scene>
  );
}
