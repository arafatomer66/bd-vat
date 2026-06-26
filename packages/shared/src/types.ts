/** Shared enums/types mirrored by the Prisma schema and consumed by the Angular app. */

export type TransactionKind = "SALE" | "PURCHASE";

/** Mushak form identifiers used across the system. */
export type MushakForm =
  | "6.1" // Purchase register
  | "6.2" // Sales register
  | "6.3" // Tax invoice (chalan)
  | "6.6" // VDS / withholding certificate
  | "6.7" // Credit note
  | "6.8" // Debit note
  | "9.1"; // Monthly VAT return

export type AdjustmentKind =
  | "INCREASING" // increases net payable
  | "DECREASING"; // decreases net payable (e.g. additional rebate)

export interface MoneyBdt {
  /** Amount in BDT, stored as a decimal string to avoid float drift. */
  amount: string;
  currency: "BDT";
}

export interface UserContext {
  userId: string;
  tenantId: string;
  role: "OWNER" | "ACCOUNTANT" | "VIEWER";
}
