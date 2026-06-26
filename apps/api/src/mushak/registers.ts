/**
 * Mushak 6.1 (purchase register) and 6.2 (sales register) exports.
 * These are the supporting registers behind the 9.1 return — one row per
 * transaction for the period, emitted as CSV for spreadsheet/NBR upload.
 */

interface RegisterTxn {
  issuedAt: Date;
  mushakNo: string | null;
  party: { name: string; bin: string | null } | null;
  netTotal: unknown;
  sdTotal: unknown;
  vatTotal: unknown;
  grandTotal: unknown;
}

function csvCell(value: string | number | null | undefined): string {
  const s = value == null ? "" : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(headers: string[], rows: (string | number | null)[][]): string {
  const lines = [headers.map(csvCell).join(",")];
  for (const r of rows) lines.push(r.map(csvCell).join(","));
  return lines.join("\n") + "\n";
}

/** Mushak 6.2 — Sales (output) register. */
export function salesRegisterCsv(txns: RegisterTxn[]): string {
  return toCsv(
    ["Date", "Invoice No (6.3)", "Buyer", "Buyer BIN", "Net Value", "SD", "Output VAT", "Total"],
    txns.map((t) => [
      t.issuedAt.toISOString().slice(0, 10),
      t.mushakNo ?? "",
      t.party?.name ?? "",
      t.party?.bin ?? "",
      String(t.netTotal),
      String(t.sdTotal),
      String(t.vatTotal),
      String(t.grandTotal),
    ])
  );
}

/** Mushak 6.1 — Purchase (input) register. */
export function purchaseRegisterCsv(txns: RegisterTxn[]): string {
  return toCsv(
    ["Date", "Supplier Invoice", "Supplier", "Supplier BIN", "Net Value", "SD", "Input VAT (rebate)", "Total"],
    txns.map((t) => [
      t.issuedAt.toISOString().slice(0, 10),
      t.mushakNo ?? "",
      t.party?.name ?? "",
      t.party?.bin ?? "",
      String(t.netTotal),
      String(t.sdTotal),
      String(t.vatTotal),
      String(t.grandTotal),
    ])
  );
}
