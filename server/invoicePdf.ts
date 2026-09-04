import fs from "fs";
import path from "path";

export interface InvoicePdfData {
  issuer: "CHAIN" | "CHIAMO";
  invoiceNumber: string;
  tenantName: string;
  status: string;
  periodStart: Date;
  periodEnd: Date;
  dueDate: Date;
  totalAmountCents: number;
  lineItems?: Array<{ description: string; amountCents: number; quantity?: number; unitLabel?: string }> | null;
}

const money = (cents: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
const date = (value: Date) => value.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
const pdfText = (value: unknown) => String(value ?? "").replace(/[^\x20-\x7e]/g, " ").replace(/([\\()])/g, "\\$1");
const text = (x: number, y: number, size: number, value: unknown, font = "F1", color = "0.10 0.16 0.27") =>
  `BT /${font} ${size} Tf ${color} rg 1 0 0 1 ${x} ${y} Tm (${pdfText(value)}) Tj ET\n`;

function logoBuffer(): Buffer {
  const candidates = [
    path.resolve(process.cwd(), "client/src/assets/chain-logo.png"),
    path.resolve(process.cwd(), "dist/chain-logo.png"),
  ];
  const logoPath = candidates.find(fs.existsSync);
  if (!logoPath) throw new Error("Chain logo asset was not found");
  return fs.readFileSync(logoPath);
}

/** Creates a dependency-free, branded PDF suitable for email attachment or download. */
export function generateInvoicePdf(invoice: InvoicePdfData): Buffer {
  const isChiamo = invoice.issuer === "CHIAMO";
  const logo = isChiamo ? null : logoBuffer(); // The checked-in Chain logo is JPEG encoded.
  if (logo && (logo[0] !== 0xff || logo[1] !== 0xd8)) throw new Error("Chain logo must be JPEG encoded");

  const items = invoice.lineItems?.length
    ? invoice.lineItems
    : [{ description: isChiamo ? "Chiamo Connect monthly service" : "Chain platform services", amountCents: invoice.totalAmountCents }];
  const pages = Array.from({ length: Math.max(1, Math.ceil(items.length / 16)) }, (_, i) => items.slice(i * 16, (i + 1) * 16));
  const firstDynamicObject = 6;
  const pageIds = pages.map((_, i) => firstDynamicObject + i * 2 + 1);
  const objects: Buffer[] = [];
  const add = (value: string | Buffer) => objects.push(Buffer.isBuffer(value) ? value : Buffer.from(value, "binary"));

  add("<< /Type /Catalog /Pages 2 0 R >>");
  add(`<< /Type /Pages /Count ${pages.length} /Kids [${pageIds.map(id => `${id} 0 R`).join(" ")}] >>`);
  add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>");
  add(logo
    ? Buffer.concat([Buffer.from(`<< /Type /XObject /Subtype /Image /Width 512 /Height 512 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${logo.length} >>\nstream\n`, "binary"), logo, Buffer.from("\nendstream", "binary")])
    : "<< /Type /ExtGState >>");

  pages.forEach((pageItems, pageIndex) => {
    let stream = "0.04 0.10 0.18 rg 0 0 612 792 re f\n";
    if (isChiamo) {
      stream += "0.13 0.76 0.70 rg 46 680 56 56 re f\n";
      stream += text(63, 697, 25, "C", "F2", "1 1 1");
      stream += text(120, 716, 24, "CHIAMO CONNECT", "F2", "0.13 0.76 0.70");
      stream += text(120, 692, 10, "BUSINESS COMMUNICATIONS", "F2", "0.55 0.72 0.72");
    } else {
      stream += "q 92 0 0 92 46 654 cm /Logo Do Q\n";
      stream += text(154, 716, 24, "CHAIN", "F2", "0.18 0.78 0.86");
      stream += text(154, 692, 10, "SOFTWARE GROUP", "F2", "0.45 0.65 0.74");
    }
    stream += text(420, 714, 25, "INVOICE", "F2", "1 1 1");
    stream += text(420, 690, 10, `#${invoice.invoiceNumber}`, "F1", "0.72 0.82 0.88");
    stream += "0.10 0.20 0.31 rg 40 620 532 2 re f\n";
    stream += text(46, 590, 9, "BILL TO", "F2", "0.35 0.76 0.83");
    stream += text(46, 570, 14, invoice.tenantName, "F2", "1 1 1");
    stream += text(330, 590, 9, "BILLING PERIOD", "F2", "0.35 0.76 0.83");
    stream += text(330, 570, 11, `${date(invoice.periodStart)} - ${date(invoice.periodEnd)}`, "F1", "1 1 1");
    stream += text(46, 535, 9, "DUE DATE", "F2", "0.35 0.76 0.83");
    stream += text(46, 516, 11, date(invoice.dueDate), "F1", "1 1 1");
    stream += text(330, 535, 9, "STATUS", "F2", "0.35 0.76 0.83");
    stream += text(330, 516, 11, invoice.status.toUpperCase(), "F2", "1 1 1");
    stream += "0.08 0.19 0.30 rg 40 475 532 30 re f\n";
    stream += text(52, 486, 9, "DESCRIPTION", "F2", "0.72 0.82 0.88");
    stream += text(500, 486, 9, "AMOUNT", "F2", "0.72 0.82 0.88");
    let y = 450;
    for (const item of pageItems) {
      const detail = item.quantity != null && item.unitLabel ? ` (${item.quantity} ${item.unitLabel})` : "";
      const description = `${item.description}${detail}`.slice(0, 72);
      stream += text(52, y, 10, description, "F1", "0.91 0.95 0.97");
      stream += text(500, y, 10, money(item.amountCents), "F2", "0.91 0.95 0.97");
      stream += "0.12 0.22 0.32 RG 46 " + (y - 10) + " m 566 " + (y - 10) + " l S\n";
      y -= 25;
    }
    if (pageIndex === pages.length - 1) {
      stream += text(400, 75, 12, "TOTAL DUE", "F2", "0.72 0.82 0.88");
      stream += text(492, 72, 18, money(invoice.totalAmountCents), "F2", "0.18 0.78 0.86");
    }
    stream += text(46, 35, 8, `${isChiamo ? "Chiamo Connect" : "Chain Software Group"}  |  Page ${pageIndex + 1} of ${pages.length}`, "F1", "0.45 0.58 0.66");
    const content = Buffer.from(stream, "binary");
    const contentId = firstDynamicObject + pageIndex * 2;
    add(Buffer.concat([Buffer.from(`<< /Length ${content.length} >>\nstream\n`, "binary"), content, Buffer.from("endstream", "binary")]));
    add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> ${isChiamo ? "" : "/XObject << /Logo 5 0 R >>"} >> /Contents ${contentId} 0 R >>`);
  });

  const chunks: Buffer[] = [Buffer.from("%PDF-1.4\n%\xff\xff\xff\xff\n", "binary")];
  const offsets = [0];
  let offset = chunks[0].length;
  objects.forEach((object, index) => {
    offsets.push(offset);
    const wrapped = Buffer.concat([Buffer.from(`${index + 1} 0 obj\n`, "binary"), object, Buffer.from("\nendobj\n", "binary")]);
    chunks.push(wrapped);
    offset += wrapped.length;
  });
  const xrefOffset = offset;
  const xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map(n => `${String(n).padStart(10, "0")} 00000 n `).join("\n")}\ntrailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  chunks.push(Buffer.from(xref, "binary"));
  return Buffer.concat(chunks);
}
