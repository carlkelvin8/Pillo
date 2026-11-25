import type { Metadata } from "next";
import { DrPillAvatar, type DrPillMood } from "@/components/brand/dr-pill-avatar";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Money } from "@/components/ui/money";
import { Switch } from "@/components/ui/switch";
import { Table, Td, Th } from "@/components/ui/table";
import { APP_NAME } from "@/config/brand";

export const metadata: Metadata = { title: "Styleguide" };

// Full class names so Tailwind can see them.
const swatches = [
  { name: "ink", cls: "bg-ink", dark: true },
  { name: "canvas", cls: "bg-canvas" },
  { name: "surface", cls: "bg-surface" },
  { name: "line", cls: "bg-line" },
  { name: "line-strong", cls: "bg-line-strong" },
  { name: "muted", cls: "bg-muted", dark: true },
  { name: "ink-2", cls: "bg-ink-2", dark: true },
  { name: "subtle", cls: "bg-subtle" },
  { name: "faint", cls: "bg-faint" },
  { name: "mint", cls: "bg-mint" },
  { name: "mint-strong", cls: "bg-mint-strong" },
  { name: "mint-ink", cls: "bg-mint-ink", dark: true },
  { name: "amber-chip", cls: "bg-amber-chip" },
  { name: "amber-chip-ink", cls: "bg-amber-chip-ink", dark: true },
  { name: "danger-chip", cls: "bg-danger-chip" },
  { name: "danger-chip-ink", cls: "bg-danger-chip-ink", dark: true },
  { name: "neutral-chip", cls: "bg-neutral-chip" },
  { name: "blush", cls: "bg-blush" },
] as const;

const moods: DrPillMood[] = ["happy", "wink", "think", "sleepy"];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={`sg-${title}`} className="flex flex-col gap-4">
      <h2 id={`sg-${title}`} className="text-card-title">
        {title}
      </h2>
      {children}
    </section>
  );
}

export default function StyleguidePage() {
  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-8 px-6 py-12 md:px-12">
      <header>
        <p className="text-muted">{APP_NAME} design system</p>
        <h1 className="text-title mt-2">Styleguide</h1>
      </header>

      <Section title="Colors">
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-6">
          {swatches.map((s) => (
            <li key={s.name} className="flex flex-col gap-2">
              <div className={`${s.cls} rounded-control border-line h-16 border`} />
              <span className={"text-muted text-xs"}>{s.name}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Typography">
        <Card className="flex flex-col gap-3">
          <p className="text-title">Page title 40/600</p>
          <p className="text-card-title">Card title 18/600</p>
          <p>Body 14/400. The quick brown fox jumps over the lazy dog.</p>
          <p className="text-muted">Muted secondary text.</p>
          <p className="tabular text-2xl font-semibold">₱ 1,234,567.89 · 0123456789</p>
        </Card>
      </Section>

      <Section title="Buttons">
        <div className="flex flex-wrap gap-3">
          <Button>Primary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="mint">Mint</Button>
          <Button variant="danger">Danger</Button>
          <Button disabled>Disabled</Button>
        </div>
      </Section>

      <Section title="Chips">
        <div className="flex flex-wrap gap-3">
          <Chip tone="success">Paid</Chip>
          <Chip tone="pending">Pending</Chip>
          <Chip tone="danger">Overdue</Chip>
          <Chip tone="neutral">Draft</Chip>
        </div>
      </Section>

      <Section title="Cards">
        <div className="grid gap-6 md:grid-cols-2">
          <Card variant="hero" aria-label="Clinic balance example">
            <p className="text-faint">Clinic balance</p>
            <p className="tabular mt-2 text-4xl font-semibold">
              <Money centavos={12_450_075} />
            </p>
          </Card>
          <Card>
            <CardTitle>Standard card</CardTitle>
            <p className="text-muted mt-2">White, 1px line border, 20px radius, soft shadow.</p>
          </Card>
        </div>
      </Section>

      <Section title="Form controls">
        <Card className="grid gap-4 md:grid-cols-2">
          <Field label="Patient name" hint="As shown on their ID.">
            <Input placeholder="Juan Dela Cruz" />
          </Field>
          <Field label="Phone" error="Enter a valid mobile number.">
            <Input defaultValue="0917" />
          </Field>
          <Field label="Doctor">
            <Select defaultValue="">
              <option value="" disabled>
                Choose a doctor
              </option>
              <option>[DOCTOR NAME]</option>
            </Select>
          </Field>
          <Field label="Notes">
            <Textarea />
          </Field>
          <label className="flex min-h-11 items-center gap-3 text-sm font-semibold">
            <Switch defaultChecked aria-label="Send reminders" />
            Send reminders
          </label>
        </Card>
      </Section>

      <Section title="Table">
        <Card className="p-2">
          <Table>
            <caption className="sr-only">Sample invoices</caption>
            <thead>
              <tr>
                <Th>Invoice</Th>
                <Th>Status</Th>
                <Th className="text-right">Total</Th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <Td>INV-0001</Td>
                <Td>
                  <Chip tone="success">Paid</Chip>
                </Td>
                <Td className="text-right">
                  <Money centavos={150_000} />
                </Td>
              </tr>
              <tr>
                <Td>INV-0002</Td>
                <Td>
                  <Chip tone="danger">Overdue</Chip>
                </Td>
                <Td className="text-right">
                  <Money centavos={89_050} />
                </Td>
              </tr>
            </tbody>
          </Table>
        </Card>
      </Section>

      <Section title="Dialog">
        <div>
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="ghost">Open dialog</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogTitle>New appointment</DialogTitle>
              <DialogDescription>Focus is trapped here. Press Escape to close.</DialogDescription>
              <div className="mt-4">
                <Field label="Reason for visit">
                  <Input />
                </Field>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </Section>

      <Section title="Dr. Pill moods">
        <Card className="flex flex-wrap items-end gap-8">
          {moods.map((m) => (
            <figure key={m} className="flex flex-col items-center gap-2">
              <DrPillAvatar mood={m} size={112} />
              <figcaption className="text-muted text-sm">{m}</figcaption>
            </figure>
          ))}
        </Card>
      </Section>
    </main>
  );
}
