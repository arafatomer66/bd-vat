import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { existsSync } from "node:fs";

/**
 * Bengali font for Mushak PDFs. PDFKit's built-in fonts can't render Bengali, so we
 * embed Hind Siliguri (SIL OFL). Resolves to apps/api/assets/fonts in both dev (src/)
 * and build (dist/) since both are two levels under apps/api.
 */
const here = dirname(fileURLToPath(import.meta.url));
const BENGALI_FONT = join(here, "..", "..", "assets", "fonts", "HindSiliguri-Regular.ttf");

let available: boolean | null = null;

/** Register the Bengali font on a doc as "bn". Returns true if Bengali can be rendered. */
export function registerBengali(doc: PDFKit.PDFDocument): boolean {
  if (available === null) available = existsSync(BENGALI_FONT);
  if (!available) return false;
  doc.registerFont("bn", BENGALI_FONT);
  return true;
}

/** Render a centered Bengali subtitle if the font is present (no-op otherwise). */
export function bengaliLine(doc: PDFKit.PDFDocument, text: string, hasBengali: boolean): void {
  if (!hasBengali) return;
  doc.font("bn").fontSize(11).fillColor("#000").text(text, { align: "center" });
  doc.font("Helvetica");
}
