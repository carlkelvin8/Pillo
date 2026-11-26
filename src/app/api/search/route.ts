import { NextResponse, type NextRequest } from "next/server";
import { can } from "@/features/auth/permissions";
import { getWorkspace } from "@/features/auth/workspace";
import { patientNames } from "@/features/patients/queries";
import { mapInvoice, mapPatient, type InvoiceHit, type PatientHit } from "@/features/search/map";
import {
  parseInvoiceNumber,
  SEARCH_LIMIT,
  searchQuerySchema,
  type SearchResponse,
  type SearchResult,
} from "@/features/search/schema";
import { rateLimit } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";

const HEADERS = { "Cache-Control": "no-store" };
const json = (body: SearchResponse | { error: string }, status = 200) =>
  NextResponse.json(body, { status, headers: HEADERS });

/** Header search. Runs as the signed-in user, so RLS limits every row to their clinic. Nothing is logged. */
export async function GET(request: NextRequest) {
  const ws = await getWorkspace();
  if (!ws?.membership) return json({ error: "Unauthorized" }, 401);
  const { role, clinic } = ws.membership;

  if (!rateLimit(`search:${ws.user.id}`, 60, 60_000)) return json({ error: "Too many searches." }, 429);

  const parsed = searchQuerySchema.safeParse(request.nextUrl.searchParams.get("q") ?? "");
  if (!parsed.success) return json({ results: [] });
  const q = parsed.data;

  const supabase = await createClient();
  const results: SearchResult[] = [];

  if (can(role, "patients.directory")) {
    const { data } = await supabase
      .from("patients")
      .select("id, full_name, patient_number, phone")
      .eq("clinic_id", clinic.id)
      .or(`full_name.ilike.%${q}%,phone.ilike.%${q}%`)
      .order("full_name", { ascending: true })
      .limit(SEARCH_LIMIT);
    results.push(...((data ?? []) as PatientHit[]).map(mapPatient));
  }

  const number = parseInvoiceNumber(q);
  if (can(role, "invoices.create") && number !== null) {
    const { data } = await supabase
      .from("invoices")
      .select("id, invoice_number, status, total_centavos, patient_id")
      .eq("clinic_id", clinic.id)
      .eq("invoice_number", number)
      .limit(SEARCH_LIMIT);
    const hits = (data ?? []) as InvoiceHit[];
    const names = can(role, "patients.directory")
      ? await patientNames(clinic.id, [...new Set(hits.map((h) => h.patient_id))])
      : new Map<string, { name: string; number: number }>();
    results.push(...hits.map((h) => mapInvoice(h, names.get(h.patient_id)?.name)));
  }

  return json({ results });
}
