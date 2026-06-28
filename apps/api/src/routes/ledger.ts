import { Router } from "express";
import { prisma } from "../prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { ensureChartOfAccounts } from "../ledger/accounts.js";

export const ledgerRouter = Router();
ledgerRouter.use(requireAuth);

const num = (v: unknown) => Number(v ?? 0);
const r2 = (n: number) => n.toFixed(2);

// Chart of accounts (auto-seeds defaults on first call).
ledgerRouter.get("/accounts", async (req, res) => {
  await ensureChartOfAccounts(req.tenantId!);
  const accounts = await prisma.account.findMany({
    where: { tenantId: req.tenantId! },
    orderBy: { code: "asc" },
  });
  res.json(accounts);
});

// Journal — recent entries with their lines.
ledgerRouter.get("/journal", async (req, res) => {
  const entries = await prisma.journalEntry.findMany({
    where: { tenantId: req.tenantId! },
    orderBy: { date: "desc" },
    take: 200,
    include: { lines: { include: { account: true } } },
  });
  res.json(
    entries.map((e) => ({
      id: e.id,
      date: e.date,
      memo: e.memo,
      lines: e.lines.map((l) => ({
        account: `${l.account.code} ${l.account.name}`,
        debit: r2(num(l.debit)),
        credit: r2(num(l.credit)),
      })),
    }))
  );
});

/** Aggregate net debit/credit per account across all journal lines. */
async function balances(tenantId: string) {
  await ensureChartOfAccounts(tenantId);
  const accounts = await prisma.account.findMany({ where: { tenantId } });
  const grouped = await prisma.journalLine.groupBy({
    by: ["accountId"],
    where: { entry: { tenantId } },
    _sum: { debit: true, credit: true },
  });
  const byId = new Map(grouped.map((g) => [g.accountId, g]));
  return accounts.map((a) => {
    const g = byId.get(a.id);
    const debit = num(g?._sum.debit);
    const credit = num(g?._sum.credit);
    return { account: a, debit, credit, balance: debit - credit };
  });
}

// Trial balance — every account's debit/credit totals (should balance).
ledgerRouter.get("/trial-balance", async (req, res) => {
  const rows = await balances(req.tenantId!);
  const totalDebit = rows.reduce((s, r) => s + r.debit, 0);
  const totalCredit = rows.reduce((s, r) => s + r.credit, 0);
  res.json({
    rows: rows.map((r) => ({
      code: r.account.code,
      name: r.account.name,
      type: r.account.type,
      debit: r2(r.debit),
      credit: r2(r.credit),
    })),
    totalDebit: r2(totalDebit),
    totalCredit: r2(totalCredit),
    balanced: Math.abs(totalDebit - totalCredit) < 0.01,
  });
});

// Profit & loss — income vs expense (normal balances: income credit, expense debit).
ledgerRouter.get("/profit-loss", async (req, res) => {
  const rows = await balances(req.tenantId!);
  const income = rows.filter((r) => r.account.type === "INCOME").map((r) => ({ ...r, amount: r.credit - r.debit }));
  const expense = rows.filter((r) => r.account.type === "EXPENSE").map((r) => ({ ...r, amount: r.debit - r.credit }));
  const totalIncome = income.reduce((s, r) => s + r.amount, 0);
  const totalExpense = expense.reduce((s, r) => s + r.amount, 0);
  res.json({
    income: income.map((r) => ({ code: r.account.code, name: r.account.name, amount: r2(r.amount) })),
    expense: expense.map((r) => ({ code: r.account.code, name: r.account.name, amount: r2(r.amount) })),
    totalIncome: r2(totalIncome),
    totalExpense: r2(totalExpense),
    netProfit: r2(totalIncome - totalExpense),
  });
});

// Balance sheet — assets vs liabilities + equity (+ retained earnings = net profit).
ledgerRouter.get("/balance-sheet", async (req, res) => {
  const rows = await balances(req.tenantId!);
  const assets = rows.filter((r) => r.account.type === "ASSET").map((r) => ({ ...r, amount: r.debit - r.credit }));
  const liabilities = rows.filter((r) => r.account.type === "LIABILITY").map((r) => ({ ...r, amount: r.credit - r.debit }));
  const equity = rows.filter((r) => r.account.type === "EQUITY").map((r) => ({ ...r, amount: r.credit - r.debit }));

  const income = rows.filter((r) => r.account.type === "INCOME").reduce((s, r) => s + (r.credit - r.debit), 0);
  const expense = rows.filter((r) => r.account.type === "EXPENSE").reduce((s, r) => s + (r.debit - r.credit), 0);
  const retained = income - expense;

  const totalAssets = assets.reduce((s, r) => s + r.amount, 0);
  const totalLiabilities = liabilities.reduce((s, r) => s + r.amount, 0);
  const totalEquity = equity.reduce((s, r) => s + r.amount, 0) + retained;

  const fmt = (list: typeof assets) => list.map((r) => ({ code: r.account.code, name: r.account.name, amount: r2(r.amount) }));
  res.json({
    assets: fmt(assets),
    liabilities: fmt(liabilities),
    equity: [...fmt(equity), { code: "—", name: "Retained earnings (P&L)", amount: r2(retained) }],
    totalAssets: r2(totalAssets),
    totalLiabilitiesAndEquity: r2(totalLiabilities + totalEquity),
    balanced: Math.abs(totalAssets - (totalLiabilities + totalEquity)) < 0.01,
  });
});
