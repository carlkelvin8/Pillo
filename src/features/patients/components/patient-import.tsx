"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { FormMessage } from "@/components/ui/form-message";
import { SubmitButton } from "@/components/ui/submit-button";
import { importPatientsCsvAction } from "@/features/patients/actions";
import { parsePatientCsv } from "@/features/patients/import-csv";
import type { PatientCsvResult } from "@/features/patients/import-csv";
import type { ActionState } from "@/lib/action-state";

export function PatientImport() {
  const [state, action] = useActionState<ActionState, FormData>(importPatientsCsvAction, {});
  const [csv, setCsv] = useState("");
  const [preview, setPreview] = useState<PatientCsvResult | null>(null);
  const [fileError, setFileError] = useState("");
  async function selectFile(file?: File) {
    if (!file) return;
    if (file.size > 1_048_576) { setFileError("CSV must be 1 MB or smaller."); setPreview(null); return; }
    const text = await file.text();
    try { const parsed = parsePatientCsv(text); setCsv(text); setPreview(parsed); setFileError(""); }
    catch (error) { setCsv(""); setPreview(null); setFileError(error instanceof Error ? error.message : "Invalid CSV."); }
  }
  return (
    <Card className="flex flex-col gap-3">
      <div><CardTitle>Import patients</CardTitle><p className="text-muted mt-1 text-sm">CSV columns: full_name, phone, email, birthdate, sex. Up to 1,000 rows and 1 MB. Imported records have no consent recorded.</p></div>
      <input type="file" accept=".csv,text/csv" onChange={(event) => void selectFile(event.target.files?.[0])} aria-label="Choose patient CSV" />
      {fileError ? <p className="text-danger-chip-ink text-sm" role="alert">{fileError}</p> : null}
      {preview ? <div className="flex flex-col gap-2 text-sm" role="status"><p>{preview.rows.length} valid rows · {preview.errors.length} rows with errors</p>{preview.errors.slice(0, 8).map((error) => <p key={error.row} className="text-danger-chip-ink">Row {error.row}: {error.message}</p>)}{preview.errors.length > 8 ? <p className="text-muted">And {preview.errors.length - 8} more row errors.</p> : null}<p className="text-muted">Preview: {preview.rows.slice(0, 3).map((row) => row.full_name).join(", ") || "No valid patients"}</p></div> : null}
      <form action={action} className="flex flex-col gap-3">
        <input type="hidden" name="csv" value={csv} />
        <div className="flex items-center gap-2"><SubmitButton pendingLabel="Importing…" disabled={!preview?.rows.length}>Import valid rows</SubmitButton>{state.ok ? <Button asChild variant="ghost"><Link href="/patients">Refresh patient list</Link></Button> : null}</div>
        <FormMessage state={state} />
      </form>
    </Card>
  );
}
