import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export type InvoicePdfData = {
  clinicName: string; invoiceNumber: number; patientName: string; status: string; dueOn: string;
  items: { description: string; quantity: number; unit_price_centavos: number; amount_centavos: number }[];
  subtotalCentavos: number; discountCentavos: number; taxCentavos: number; totalCentavos: number;
};
const money = (centavos: number) => `PHP ${(centavos / 100).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export async function renderInvoicePdf(data: InvoicePdfData): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let page = pdf.addPage([595.28, 841.89]);
  let y = 790;
  const line = (text: string, opts: { bold?: boolean; size?: number; x?: number } = {}) => {
    if (y < 70) { page = pdf.addPage([595.28, 841.89]); y = 790; }
    page.drawText(text.replace(/[^\x20-\x7E]/g, "?"), { x: opts.x ?? 48, y, size: opts.size ?? 11, font: opts.bold ? bold : font, color: rgb(0.08, 0.09, 0.08), maxWidth: 500 });
    y -= (opts.size ?? 11) + 12;
  };
  line(data.clinicName, { bold: true, size: 20 });
  line(`Invoice #${data.invoiceNumber}`, { bold: true, size: 16 });
  line(`Status: ${data.status}    Due: ${data.dueOn}`);
  y -= 8;
  line(`Patient: ${data.patientName}`, { bold: true });
  y -= 12;
  line("Description                                      Qty            Unit price                Amount", { bold: true });
  for (const item of data.items) {
    line(`${item.description}     ${item.quantity}     ${money(item.unit_price_centavos)}     ${money(item.amount_centavos)}`);
  }
  y -= 16;
  line(`Subtotal: ${money(data.subtotalCentavos)}`, { x: 330 });
  if (data.discountCentavos > 0) line(`Discount: ${money(data.discountCentavos)}`, { x: 330 });
  if (data.taxCentavos > 0) line(`Tax: ${money(data.taxCentavos)}`, { x: 330 });
  line(`Total: ${money(data.totalCentavos)}`, { bold: true, size: 14, x: 330 });
  return pdf.save();
}
