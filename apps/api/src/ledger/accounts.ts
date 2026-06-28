import { prisma } from "../prisma.js";

/**
 * Default double-entry chart of accounts created per company. Codes follow the usual
 * 1xxx asset / 2xxx liability / 3xxx equity / 4xxx income / 5xxx expense convention.
 */
export const DEFAULT_ACCOUNTS: { code: string; name: string; type: "ASSET" | "LIABILITY" | "EQUITY" | "INCOME" | "EXPENSE" }[] = [
  { code: "1000", name: "Cash & Bank", type: "ASSET" },
  { code: "1100", name: "Accounts Receivable", type: "ASSET" },
  { code: "1200", name: "Input VAT Receivable (rebate)", type: "ASSET" },
  { code: "2000", name: "Accounts Payable", type: "LIABILITY" },
  { code: "2100", name: "VAT Payable (output)", type: "LIABILITY" },
  { code: "2200", name: "Supplementary Duty Payable", type: "LIABILITY" },
  { code: "3000", name: "Owner's Equity", type: "EQUITY" },
  { code: "4000", name: "Sales", type: "INCOME" },
  { code: "5000", name: "Purchases", type: "EXPENSE" },
];

/** Ensure the tenant has its chart of accounts; returns a code -> accountId map. */
export async function ensureChartOfAccounts(tenantId: string): Promise<Record<string, string>> {
  const existing = await prisma.account.findMany({ where: { tenantId } });
  const map: Record<string, string> = {};
  for (const a of existing) map[a.code] = a.id;

  const missing = DEFAULT_ACCOUNTS.filter((d) => !map[d.code]);
  for (const d of missing) {
    const acc = await prisma.account.create({
      data: { tenantId, code: d.code, name: d.name, type: d.type },
    });
    map[d.code] = acc.id;
  }
  return map;
}

interface PostableTxn {
  id: string;
  kind: "SALE" | "PURCHASE";
  issuedAt: Date;
  netTotal: unknown;
  sdTotal: unknown;
  vatTotal: unknown;
  grandTotal: unknown;
  mushakNo?: string | null;
}

/**
 * Post a SALE/PURCHASE to the general ledger as a balanced journal entry.
 *   SALE:     Dr A/R(grand) | Cr Sales(net) + VAT payable(vat) + SD payable(sd)
 *   PURCHASE: Dr Purchases(net+sd) + Input VAT(vat) | Cr A/P(grand)
 */
export async function postTransaction(tenantId: string, txn: PostableTxn): Promise<void> {
  const acc = await ensureChartOfAccounts(tenantId);
  const n = (v: unknown) => Number(v ?? 0);
  const net = n(txn.netTotal), sd = n(txn.sdTotal), vat = n(txn.vatTotal), grand = n(txn.grandTotal);

  const lines: { accountId: string; debit: number; credit: number }[] = [];
  if (txn.kind === "SALE") {
    lines.push({ accountId: acc["1100"]!, debit: grand, credit: 0 });
    lines.push({ accountId: acc["4000"]!, debit: 0, credit: net });
    if (vat) lines.push({ accountId: acc["2100"]!, debit: 0, credit: vat });
    if (sd) lines.push({ accountId: acc["2200"]!, debit: 0, credit: sd });
  } else {
    lines.push({ accountId: acc["5000"]!, debit: net + sd, credit: 0 });
    if (vat) lines.push({ accountId: acc["1200"]!, debit: vat, credit: 0 });
    lines.push({ accountId: acc["2000"]!, debit: 0, credit: grand });
  }

  await prisma.journalEntry.create({
    data: {
      tenantId,
      date: txn.issuedAt,
      memo: `${txn.kind} ${txn.mushakNo ?? txn.id}`,
      sourceType: "transaction",
      sourceId: txn.id,
      lines: { create: lines },
    },
  });
}
