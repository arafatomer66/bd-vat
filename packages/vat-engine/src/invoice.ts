import { d, toBdt, sum, type Money } from "./money.js";

/**
 * A single line on a tax invoice (Mushak 6.3).
 * `vatRate` and `sdRate` are decimals (0.15 = 15%). Supplementary Duty (SD), where
 * applicable, is charged on the value and VAT is then charged on (value + SD), which
 * is how the SD&VAT Act 2012 layers the two.
 */
export interface InvoiceLineInput {
  description: string;
  quantity: Money;
  unitPrice: Money;
  vatRate: number;
  /** Supplementary Duty rate, if the good/service is SD-liable. Defaults to 0. */
  sdRate?: number;
}

export interface InvoiceLineResult {
  description: string;
  netValue: string; // quantity * unitPrice (VAT-exclusive)
  sdAmount: string;
  vatableValue: string; // netValue + sdAmount
  vatAmount: string;
  lineTotal: string; // vatableValue + vatAmount
}

export interface InvoiceTotals {
  lines: InvoiceLineResult[];
  netTotal: string;
  sdTotal: string;
  vatTotal: string;
  grandTotal: string;
}

export function computeInvoiceLine(line: InvoiceLineInput): InvoiceLineResult {
  const netValue = d(line.quantity).times(line.unitPrice);
  const sdAmount = netValue.times(line.sdRate ?? 0);
  const vatableValue = netValue.plus(sdAmount);
  const vatAmount = vatableValue.times(line.vatRate);
  const lineTotal = vatableValue.plus(vatAmount);

  return {
    description: line.description,
    netValue: toBdt(netValue),
    sdAmount: toBdt(sdAmount),
    vatableValue: toBdt(vatableValue),
    vatAmount: toBdt(vatAmount),
    lineTotal: toBdt(lineTotal),
  };
}

export function computeInvoice(lines: InvoiceLineInput[]): InvoiceTotals {
  const computed = lines.map(computeInvoiceLine);
  return {
    lines: computed,
    netTotal: toBdt(sum(computed.map((l) => l.netValue))),
    sdTotal: toBdt(sum(computed.map((l) => l.sdAmount))),
    vatTotal: toBdt(sum(computed.map((l) => l.vatAmount))),
    grandTotal: toBdt(sum(computed.map((l) => l.lineTotal))),
  };
}
