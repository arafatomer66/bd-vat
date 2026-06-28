import PDFDocument from "pdfkit";

/**
 * Generic renderers for the secondary Mushak forms (6.4 / 6.5 / 6.10 / 4.3),
 * the VDS withholding return, and the 2.1 registration application. They share
 * one low-level layout so every form looks consistent.
 */

const MARGIN = 45;

interface DocLine {
  description: string;
  quantity?: string;
  unitPrice?: string;
  amount?: string;
}

function header(doc: PDFKit.PDFDocument, title: string, subtitle: string) {
  doc.fontSize(9).fillColor("#555").text("Government of the People's Republic of Bangladesh", { align: "center" });
  doc.text("National Board of Revenue", { align: "center" });
  doc.moveDown(0.3);
  doc.fontSize(14).fillColor("#000").text(title, { align: "center" });
  doc.fontSize(8).fillColor("#777").text(subtitle, { align: "center" });
  doc.moveDown(0.8);
}

function kv(doc: PDFKit.PDFDocument, pairs: [string, string][]) {
  doc.fontSize(9).fillColor("#000");
  for (const [k, v] of pairs) {
    doc.font("Helvetica-Bold").text(`${k}: `, { continued: true });
    doc.font("Helvetica").fillColor("#333").text(v || "—");
    doc.fillColor("#000");
  }
  doc.moveDown(0.6);
}

function lineTable(doc: PDFKit.PDFDocument, cols: string[], rows: string[][]) {
  const width = doc.page.width - MARGIN * 2;
  const colW = width / cols.length;
  let y = doc.y;
  doc.rect(MARGIN, y - 2, width, 18).fill("#f0f0f0").fillColor("#000");
  doc.font("Helvetica-Bold").fontSize(8);
  cols.forEach((c, i) => doc.text(c, MARGIN + 2 + i * colW, y + 3, { width: colW - 4 }));
  y += 18;
  doc.font("Helvetica").fillColor("#222");
  for (const r of rows) {
    r.forEach((cell, i) =>
      doc.text(cell, MARGIN + 2 + i * colW, y + 3, { width: colW - 4, align: i === 0 ? "left" : "right" })
    );
    doc.moveTo(MARGIN, y + 17).lineTo(MARGIN + width, y + 17).strokeColor("#eee").stroke();
    y += 18;
  }
  doc.y = y + 6;
}

function footer(doc: PDFKit.PDFDocument, note: string) {
  doc.font("Helvetica").fontSize(8).fillColor("#777");
  doc.text(note, MARGIN, doc.page.height - MARGIN - 22, {
    width: doc.page.width - MARGIN * 2,
    align: "center",
  });
}

const FORM_TITLES: Record<string, { title: string; sub: string }> = {
  "6.4": { title: "Mushak 6.4 — Contract Manufacturing", sub: "[ goods produced under contract / job work ]" },
  "6.5": { title: "Mushak 6.5 — Transfer of Goods", sub: "[ movement between own premises / branches ]" },
  "6.10": { title: "Mushak 6.10 — Record of Purchase & Supply", sub: "[ transactions above the prescribed threshold ]" },
};

export interface DocumentPdfData {
  form: "6.4" | "6.5" | "6.10";
  company: { name: string; bin: string };
  docNo?: string | null;
  counterparty?: string | null;
  fromLocation?: string | null;
  toLocation?: string | null;
  reason?: string | null;
  issuedAt: Date;
  value: string;
  vat: string;
  lines: DocLine[];
}

export function renderDocumentPdf(d: DocumentPdfData, out: NodeJS.WritableStream): void {
  const doc = new PDFDocument({ size: "A4", margin: MARGIN });
  doc.pipe(out);
  const t = FORM_TITLES[d.form]!;
  header(doc, t.title, t.sub);
  kv(doc, [
    ["Company", `${d.company.name} (BIN ${d.company.bin})`],
    ["Document no", d.docNo ?? ""],
    ["Date", d.issuedAt.toISOString().slice(0, 10)],
    ["Counterparty", d.counterparty ?? ""],
    ["From", d.fromLocation ?? ""],
    ["To", d.toLocation ?? ""],
    ["Reason", d.reason ?? ""],
  ]);
  lineTable(
    doc,
    ["Description", "Qty", "Unit price", "Amount"],
    d.lines.map((l) => [l.description, l.quantity ?? "", l.unitPrice ?? "", l.amount ?? ""])
  );
  kv(doc, [["Total value", `Tk ${d.value}`], ["VAT", `Tk ${d.vat}`]]);
  footer(doc, "System-generated Mushak document.");
  doc.end();
}

export interface CoefficientPdfData {
  company: { name: string; bin: string };
  productName: string;
  outputUnit?: string | null;
  declaredAt: Date;
  inputs: { name: string; quantity: string; unit?: string; unitPrice?: string }[];
}

export function renderCoefficientPdf(d: CoefficientPdfData, out: NodeJS.WritableStream): void {
  const doc = new PDFDocument({ size: "A4", margin: MARGIN });
  doc.pipe(out);
  header(doc, "Mushak 4.3 — Input-Output Coefficient", "[ declaration of inputs per unit of output ]");
  kv(doc, [
    ["Company", `${d.company.name} (BIN ${d.company.bin})`],
    ["Output product", `${d.productName}${d.outputUnit ? ` (per ${d.outputUnit})` : ""}`],
    ["Declared", d.declaredAt.toISOString().slice(0, 10)],
  ]);
  lineTable(
    doc,
    ["Input", "Quantity", "Unit", "Unit price"],
    d.inputs.map((i) => [i.name, i.quantity, i.unit ?? "", i.unitPrice ?? ""])
  );
  footer(doc, "Input-output coefficient declaration under the VAT & SD Rules, 2016.");
  doc.end();
}

export interface VdsReturnPdfData {
  company: { name: string; bin: string };
  year: number;
  month: number;
  certificates: { certificateNo: string; issuedAt: string; amount: string }[];
  total: string;
}

export function renderVdsReturnPdf(d: VdsReturnPdfData, out: NodeJS.WritableStream): void {
  const doc = new PDFDocument({ size: "A4", margin: MARGIN });
  doc.pipe(out);
  header(doc, "VAT Deducted at Source — Return", "[ Mushak 6.6 withholding summary for the period ]");
  kv(doc, [
    ["Withholding entity", `${d.company.name} (BIN ${d.company.bin})`],
    ["Period", `${d.year}-${String(d.month).padStart(2, "0")}`],
  ]);
  lineTable(
    doc,
    ["Certificate no", "Date", "VAT withheld"],
    d.certificates.map((c) => [c.certificateNo, c.issuedAt, c.amount])
  );
  kv(doc, [["Total VAT withheld & deposited", `Tk ${d.total}`]]);
  footer(doc, "VDS withheld on purchases must be deposited to the treasury.");
  doc.end();
}

export interface RegistrationPdfData {
  name: string;
  bin: string;
  tin?: string | null;
  address?: string | null;
  commissionerate?: string | null;
  division?: string | null;
  circle?: string | null;
  economicActivity?: string | null;
}

export function renderRegistrationPdf(d: RegistrationPdfData, out: NodeJS.WritableStream): void {
  const doc = new PDFDocument({ size: "A4", margin: MARGIN });
  doc.pipe(out);
  header(doc, "Mushak 2.1 — VAT Registration Application", "[ application for VAT registration / turnover tax ]");
  kv(doc, [
    ["Legal name", d.name],
    ["BIN", d.bin],
    ["e-TIN", d.tin ?? ""],
    ["Address", d.address ?? ""],
    ["Commissionerate", d.commissionerate ?? ""],
    ["Division", d.division ?? ""],
    ["Circle", d.circle ?? ""],
    ["Economic activity", d.economicActivity ?? ""],
  ]);
  footer(doc, "Pre-filled Mushak 2.1 application — verify and submit to your VAT circle.");
  doc.end();
}
