import PDFDocument from "pdfkit";
import { registerBengali, bengaliLine } from "./fonts.js";

/**
 * Mushak 9.1 — Value Added Tax Return (দাখিলপত্র) for a single tax period.
 * A simplified, readable rendering of the key Part-by-Part figures that an SME
 * needs to file. The full multi-page gazette form can be layered in later; the
 * figures and net-payable here are computed by the VAT engine and authoritative.
 */

export interface Mushak91Seller {
  name: string;
  bin: string;
  address?: string | null;
}

export interface Mushak91Data {
  year: number;
  month: number;
  status: string;
  seller: Mushak91Seller;
  outputVat: string;
  outputSd: string;
  inputVatRebate: string;
  vdsWithheldOnSales: string;
  increasingAdjustment: string;
  decreasingAdjustment: string;
  openingRebateBalance: string;
  treasuryDeposits: string;
  netPayable: string;
  carryForward: string;
  challanNo?: string | null;
}

const MARGIN = 45;
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export function renderMushak91(data: Mushak91Data, out: NodeJS.WritableStream): void {
  const doc = new PDFDocument({ size: "A4", margin: MARGIN });
  doc.pipe(out);
  const hasBn = registerBengali(doc);
  const width = doc.page.width - MARGIN * 2;

  doc.fontSize(9).fillColor("#555").text("Government of the People's Republic of Bangladesh", { align: "center" });
  doc.text("National Board of Revenue", { align: "center" });
  doc.moveDown(0.3);
  doc.fontSize(14).fillColor("#000").text("Value Added Tax Return — Mushak 9.1", { align: "center" });
  bengaliLine(doc, "মূল্য সংযোজন কর দাখিলপত্র", hasBn);
  doc.fontSize(8).fillColor("#777").text("[ monthly VAT return ]", { align: "center" });
  doc.moveDown(0.8);

  doc.fontSize(9).fillColor("#000");
  doc.font("Helvetica-Bold").text(data.seller.name, MARGIN);
  doc.font("Helvetica").fillColor("#333").text(`BIN: ${data.seller.bin}`);
  if (data.seller.address) doc.text(data.seller.address);
  doc.fillColor("#000").text(`Tax period: ${MONTHS[data.month - 1]} ${data.year}`);
  doc.text(`Status: ${data.status}`);
  doc.moveDown(0.8);

  const rows: Array<[string, string, boolean?]> = [
    ["Output tax (VAT on sales)", data.outputVat],
    ["Supplementary Duty payable", data.outputSd],
    ["Increasing adjustments (debit notes etc.)", data.increasingAdjustment],
    ["Total output tax (A)", add(data.outputVat, data.outputSd, data.increasingAdjustment), true],
    ["Input tax rebate (on purchases)", data.inputVatRebate],
    ["VDS withheld on your sales", data.vdsWithheldOnSales],
    ["Decreasing adjustments (credit notes etc.)", data.decreasingAdjustment],
    ["Opening rebate balance (carried from last period)", data.openingRebateBalance],
    [
      "Total rebate & credits (B)",
      add(data.inputVatRebate, data.vdsWithheldOnSales, data.decreasingAdjustment, data.openingRebateBalance),
      true,
    ],
    ["Treasury deposits made", data.treasuryDeposits],
    ["Net VAT payable (A - B - deposits)", data.netPayable, true],
    ["Rebate carried forward to next period", data.carryForward],
  ];

  let y = doc.y;
  const valX = MARGIN + width * 0.62;
  const valW = width * 0.38;
  rows.forEach(([label, value, bold]) => {
    if (bold) doc.rect(MARGIN, y - 2, width, 18).fill("#f0f7f2").fillColor("#000");
    doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(bold ? 10 : 9).fillColor("#000");
    doc.text(label, MARGIN + 4, y + 2, { width: width * 0.6 });
    doc.text("Tk " + value, valX, y + 2, { width: valW - 4, align: "right" });
    y += bold ? 22 : 17;
  });

  if (data.challanNo) {
    doc.moveDown(1);
    doc.font("Helvetica").fontSize(9).fillColor("#333").text(`Treasury challan no: ${data.challanNo}`, MARGIN, y + 10);
  }

  doc.font("Helvetica").fontSize(8).fillColor("#777");
  doc.text(
    "System-generated summary of Mushak 9.1. The return must be filed by the 15th day of the following month.",
    MARGIN,
    doc.page.height - MARGIN - 24,
    { width, align: "center" }
  );

  doc.end();
}

function add(...vals: string[]): string {
  const total = vals.reduce((s, v) => s + Number(v || 0), 0);
  return total.toFixed(2);
}
