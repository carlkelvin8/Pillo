import { patientFormSchema } from "./schemas";

export const PATIENT_CSV_MAX_BYTES = 1_048_576;
export const PATIENT_CSV_MAX_ROWS = 1_000;
const HEADERS = ["full_name", "phone", "email", "birthdate", "sex"] as const;

export type PatientImportRow = { full_name: string; phone: string | null; email: string | null; birthdate: string | null; sex: "female" | "male" | "other" | null; consent_at: null };
export type PatientCsvResult = { rows: PatientImportRow[]; errors: { row: number; message: string }[]; total: number };

/** Dedup key for imports: name trimmed, lowercased, inner spaces collapsed; phone as digits with +63 read as 0. */
export function patientDedupKey(name: string, phone: string | null): string {
  const n = name.trim().toLowerCase().replace(/\s+/g, " ");
  let digits = (phone ?? "").replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("63")) digits = `0${digits.slice(2)}`;
  return `${n}|${digits}`;
}

function records(text: string): string[][] {
  const output: string[][] = [];
  let row: string[] = [], cell = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i]!;
    if (quoted && char === '"' && text[i + 1] === '"') { cell += '"'; i++; }
    else if (char === '"') quoted = !quoted;
    else if (char === "," && !quoted) { row.push(cell); cell = ""; }
    else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      if (row.some((value) => value.trim())) output.push(row);
      row = [];
    } else cell += char;
  }
  if (quoted) throw new Error("CSV contains an unclosed quote.");
  row.push(cell);
  if (row.some((value) => value.trim())) output.push(row);
  return output;
}

export function parsePatientCsv(text: string): PatientCsvResult {
  if (new TextEncoder().encode(text).byteLength > PATIENT_CSV_MAX_BYTES) throw new Error("CSV must be 1 MB or smaller.");
  const parsed = records(text);
  if (!parsed.length) throw new Error("CSV is empty.");
  const headers = parsed[0]!.map((value) => value.trim().toLowerCase());
  if (headers.length !== HEADERS.length || HEADERS.some((header, i) => headers[i] !== header))
    throw new Error(`Use these columns in order: ${HEADERS.join(", ")}.`);
  const source = parsed.slice(1);
  if (source.length > PATIENT_CSV_MAX_ROWS) throw new Error("CSV can contain at most 1,000 patient rows.");
  const rows: PatientImportRow[] = [];
  const errors: PatientCsvResult["errors"] = [];
  source.forEach((cells, index) => {
    const input = Object.fromEntries(HEADERS.map((header, i) => [header, (cells[i] ?? "").trim()]));
    const parsedRow = patientFormSchema.safeParse({
      fullName: input.full_name, phone: input.phone, email: input.email,
      birthdate: input.birthdate, sex: input.sex?.toLowerCase(), consent: false,
    });
    if (!parsedRow.success) {
      errors.push({ row: index + 2, message: parsedRow.error.issues[0]?.message ?? "Invalid row." });
      return;
    }
    rows.push({
      full_name: parsedRow.data.fullName,
      phone: parsedRow.data.phone ?? null,
      email: parsedRow.data.email ?? null,
      birthdate: parsedRow.data.birthdate ?? null,
      sex: parsedRow.data.sex ?? null,
      consent_at: null,
    });
  });
  return { rows, errors, total: source.length };
}
