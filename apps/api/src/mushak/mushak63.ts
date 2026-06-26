import PDFDocument from "pdfkit";

/**
 * Mushak 6.3 — Tax Invoice (চালানপত্র) under Rule 40(1)(চ) of the VAT and SD Rules, 2016.
 * This produces a clean, compliant-style A4 tax invoice. Field labels follow the
 * official form (bilingual) so it is recognisable to an NBR officer; the exact
 * gazette layout can be swapped in later without touching callers.
 */

export interface Mushak63Seller {
  name: string;
  bin: string;
  address?: string | null;
}

export interface Mushak63Buyer {
  name?: string | null;
  bin?: string | null;
  address?: string | null;
}

export interface Mushak63Line {
  description: string;
  quantity: string;
  unitPrice: string;
  vatRate: string; // decimal string, e.g. "0.15"
  netValue: string;
  sdAmount: string;
  vatAmount: string;
  lineTotal: string;
}

export interface Mushak63Data {
  invoiceNo: string;
  issuedAt: Date;
  seller: Mushak63Seller;
  buyer: Mushak63Buyer;
  lines: Mushak63Line[];
  netTotal: string;
  sdTotal: string;
  vatTotal: string;
  grandTotal: string;
}

const PAGE_MARGIN = 40;
const TAKA = "Tk ";

function pct(decimal: string): string {
  const n = Number(decimal) * 100;
  return `${Number.isInteger(n) ? n : n.toFixed(2)}%`;
}

/** Build the Mushak 6.3 PDF and stream it into the provided writable (e.g. an HTTP response). */
export function renderMushak63(data: Mushak63Data, out: NodeJS.WritableStream): void {
  const doc = new PDFDocument({ size: "A4", margin: PAGE_MARGIN });
  doc.pipe(out);

  const pageWidth = doc.page.width - PAGE_MARGIN * 2;

  // Header
  doc.fontSize(9).fillColor("#555").text("Government of the People's Republic of Bangladesh", { align: "center" });
  doc.text("National Board of Revenue", { align: "center" });
  doc.moveDown(0.3);
  doc.fontSize(14).fillColor("#000").text("Tax Invoice  —  Mushak 6.3", { align: "center" });
  // Bengali label intentionally romanised: the built-in PDF fonts cannot render Bengali
  // Unicode. A Bengali TTF can be embedded later to print "চালানপত্র" natively.
  doc.fontSize(8).fillColor("#777").text("[ Chalanpatra · Rule 40(1)(chha), VAT & SD Rules 2016 ]", { align: "center" });
  doc.moveDown(0.8);

  // Seller / buyer block
  const colW = pageWidth / 2;
  const top = doc.y;
  doc.fontSize(9).fillColor("#000");
  doc.font("Helvetica-Bold").text("Supplier (Seller)", PAGE_MARGIN, top);
  doc.font("Helvetica").fillColor("#333");
  doc.text(data.seller.name);
  doc.text(`BIN: ${data.seller.bin}`);
  if (data.seller.address) doc.text(data.seller.address, { width: colW - 10 });

  const buyerX = PAGE_MARGIN + colW;
  doc.fillColor("#000").font("Helvetica-Bold").text("Recipient (Buyer)", buyerX, top);
  doc.font("Helvetica").fillColor("#333");
  doc.text(data.buyer.name || "—", buyerX);
  if (data.buyer.bin) doc.text(`BIN: ${data.buyer.bin}`, buyerX);
  if (data.buyer.address) doc.text(data.buyer.address, buyerX, doc.y, { width: colW - 10 });

  doc.moveDown(1);
  doc.fillColor("#000").font("Helvetica");
  const metaY = doc.y;
  doc.text(`Invoice No: ${data.invoiceNo}`, PAGE_MARGIN, metaY);
  doc.text(`Date: ${data.issuedAt.toISOString().slice(0, 10)}`, buyerX, metaY);
  doc.moveDown(1);

  // Table
  const cols = [
    { key: "sl", label: "Sl", w: 0.05 },
    { key: "description", label: "Description of goods/services", w: 0.32 },
    { key: "quantity", label: "Qty", w: 0.09 },
    { key: "unitPrice", label: "Unit price", w: 0.12 },
    { key: "netValue", label: "Value", w: 0.12 },
    { key: "vat", label: "VAT", w: 0.14 },
    { key: "lineTotal", label: "Total", w: 0.16 },
  ];
  const xs: number[] = [];
  let acc = PAGE_MARGIN;
  for (const c of cols) {
    xs.push(acc);
    acc += c.w * pageWidth;
  }

  const rowHeight = 20;
  function drawRow(cells: string[], y: number, opts: { header?: boolean } = {}) {
    doc.font(opts.header ? "Helvetica-Bold" : "Helvetica").fontSize(8);
    doc.fillColor(opts.header ? "#000" : "#222");
    if (opts.header) doc.rect(PAGE_MARGIN, y - 2, pageWidth, rowHeight).fill("#f0f0f0").fillColor("#000");
    cols.forEach((c, i) => {
      const cellW = c.w * pageWidth - 4;
      const align = i >= 2 ? "right" : "left";
      doc.fillColor(opts.header ? "#000" : "#222").text(cells[i] ?? "", xs[i]! + 2, y + 3, { width: cellW, align });
    });
  }

  let y = doc.y;
  drawRow(cols.map((c) => c.label), y, { header: true });
  y += rowHeight;
  data.lines.forEach((l, idx) => {
    drawRow(
      [
        String(idx + 1),
        l.description,
        l.quantity,
        l.unitPrice,
        l.netValue,
        `${l.vatAmount} (${pct(l.vatRate)})`,
        l.lineTotal,
      ],
      y
    );
    doc.moveTo(PAGE_MARGIN, y + rowHeight - 1).lineTo(PAGE_MARGIN + pageWidth, y + rowHeight - 1).strokeColor("#eee").stroke();
    y += rowHeight;
  });

  // Totals
  y += 6;
  const totalsX = PAGE_MARGIN + pageWidth * 0.55;
  const labelW = pageWidth * 0.25;
  const valW = pageWidth * 0.2;
  function totalLine(label: string, value: string, bold = false) {
    doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(bold ? 10 : 9).fillColor("#000");
    doc.text(label, totalsX, y, { width: labelW, align: "right" });
    doc.text(TAKA + value, totalsX + labelW, y, { width: valW, align: "right" });
    y += bold ? 18 : 15;
  }
  totalLine("Net value", data.netTotal);
  if (Number(data.sdTotal) > 0) totalLine("Supplementary Duty", data.sdTotal);
  totalLine("VAT (output tax)", data.vatTotal);
  totalLine("Grand total", data.grandTotal, true);

  // Footer
  doc.font("Helvetica").fontSize(8).fillColor("#777");
  doc.text(
    "This is a system-generated Mushak 6.3 tax invoice. Input tax credit is admissible only against a valid tax invoice.",
    PAGE_MARGIN,
    doc.page.height - PAGE_MARGIN - 30,
    { width: pageWidth, align: "center" }
  );

  doc.end();
}
