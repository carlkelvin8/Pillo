"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { patientIdLabel } from "@/features/patients/age";
import { searchPatientsAction } from "@/features/patients/actions";
import { initials } from "@/lib/initials";

type Hit = { id: string; name: string; number: number };

type Props = {
  /** Name of the hidden input that carries the chosen patient id. */
  name?: string;
  label?: string;
  initial?: Hit | null;
  error?: string;
};

/** Search-as-you-type patient chooser. Submits the selected id in a hidden input. */
export function PatientPicker({
  name = "patientId",
  label = "Patient",
  initial = null,
  error,
}: Props) {
  const id = useId();
  const listId = `${id}-list`;
  const [selected, setSelected] = useState<Hit | null>(initial);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [searched, setSearched] = useState(false);
  const [pending, startTransition] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  function onChange(value: string) {
    setQuery(value);
    clearTimeout(timer.current);
    if (value.trim().length < 2) {
      setHits([]);
      setSearched(false);
      return;
    }
    timer.current = setTimeout(() => {
      startTransition(async () => {
        setHits(await searchPatientsAction(value));
        setSearched(true);
      });
    }, 250);
  }

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      <input type="hidden" name={name} value={selected?.id ?? ""} />
      {selected ? (
        <div className="rounded-control border-line-strong bg-surface flex items-center gap-3 border p-2 pr-3">
          <span
            aria-hidden="true"
            className="bg-mint text-mint-ink flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold"
          >
            {initials(selected.name)}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{selected.name}</p>
            <p className="text-muted text-xs">ID {patientIdLabel(selected.number)}</p>
          </div>
          <button
            type="button"
            onClick={() => setSelected(null)}
            className="rounded-control text-muted hover:text-ink inline-flex min-h-11 items-center px-3 text-sm font-medium"
          >
            Change
          </button>
        </div>
      ) : (
        <>
          <Input
            id={id}
            type="search"
            autoComplete="off"
            placeholder="Search by name or phone"
            value={query}
            onChange={(e) => onChange(e.target.value)}
            aria-controls={listId}
            aria-invalid={error ? true : undefined}
          />
          <div id={listId} aria-live="polite">
            {pending ? <p className="text-muted text-sm">Searching…</p> : null}
            {!pending && searched && hits.length === 0 ? (
              <p className="text-muted text-sm">No patients found.</p>
            ) : null}
            {hits.length > 0 ? (
              <ul className="rounded-control border-line bg-surface flex flex-col overflow-hidden border">
                {hits.map((h) => (
                  <li key={h.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setSelected(h);
                        setHits([]);
                        setQuery("");
                      }}
                      className="hover:bg-subtle flex min-h-11 w-full items-center gap-3 px-3 py-2 text-left"
                    >
                      <span
                        aria-hidden="true"
                        className="bg-mint text-mint-ink flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold"
                      >
                        {initials(h.name)}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">{h.name}</span>
                      <span className="text-muted text-xs">ID {patientIdLabel(h.number)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </>
      )}
      {error ? <p className="text-danger-chip-ink text-sm">{error}</p> : null}
    </div>
  );
}
