import { patientIdLabel } from "@/features/patients/age";
import { invoiceLabel } from "@/features/invoices/totals";
import { formatPHP } from "@/lib/money";
import type { SearchResult } from "./schema";

export type PatientHit = { id: string; full_name: string; patient_number: number; phone: string | null };
export type InvoiceHit = {
  id: string;
  invoice_number: number;
  status: string;
  total_centavos: number;
  patient_id: string;
};

export function mapPatient(p: PatientHit): SearchResult {
  return {
    group: "patients",
    id: p.id,
    title: p.full_name,
    subtitle: [`ID ${patientIdLabel(p.patient_number)}`, p.phone].filter(Boolean).join(" · "),
    href: `/patients/${p.id}`,
  };
}

export function mapInvoice(i: InvoiceHit, patientName: string | undefined): SearchResult {
  const status = i.status.charAt(0).toUpperCase() + i.status.slice(1);
  return {
    group: "invoices",
    id: i.id,
    title: invoiceLabel(i.invoice_number),
    subtitle: [patientName, formatPHP(i.total_centavos), status].filter(Boolean).join(" · "),
    href: `/invoices/${i.id}`,
  };
}
