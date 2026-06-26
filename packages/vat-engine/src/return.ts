import { Decimal } from "decimal.js";
import { d, toBdt, type Money } from "./money.js";

/**
 * Inputs to a monthly VAT return (Mushak 9.1) for one tax period (one calendar month).
 * All amounts are VAT/SD figures already computed at transaction time by the invoice
 * engine and aggregated for the period.
 */
export interface ReturnInput {
  /** Output VAT charged on taxable sales for the period. */
  outputVat: Money;
  /** Supplementary Duty payable on sales for the period. */
  outputSd?: Money;
  /**
   * Input VAT eligible for rebate (decreasing adjustment). Only purchases backed by a
   * valid Mushak 6.3 and meeting the rebate conditions of the Act should be included.
   */
  inputVatRebate: Money;
  /**
   * VAT withheld at source on the taxpayer's own SALES by withholding entities
   * (certified via Mushak 6.6). This VAT is deposited to the treasury by the
   * withholder, so it reduces what the taxpayer remits directly.
   */
  vdsWithheldOnSales?: Money;
  /** Increasing adjustments (e.g. debit notes, interest, prior-period corrections). */
  increasingAdjustments?: Money;
  /** Decreasing adjustments (e.g. credit notes, additional rebates). */
  decreasingAdjustments?: Money;
  /** Closing balance / negative net carried forward from the previous period. */
  openingRebateBalance?: Money;
  /** Advance/treasury deposits already made for this period. */
  treasuryDeposits?: Money;
}

export interface ReturnResult {
  totalOutputTax: string; // outputVat + outputSd + increasingAdjustments
  totalRebateAndCredits: string; // inputVatRebate + decreasing + vds + opening balance
  netVatBeforePayment: string; // output - credits (can be negative => carry forward)
  treasuryDeposits: string;
  /** Amount still payable to the treasury this period (>= 0). */
  netPayable: string;
  /** Negative net carried forward to the next period as opening rebate balance (>= 0). */
  carryForward: string;
}

export function computeReturn(input: ReturnInput): ReturnResult {
  const totalOutputTax = d(input.outputVat)
    .plus(input.outputSd ?? 0)
    .plus(input.increasingAdjustments ?? 0);

  const totalCredits = d(input.inputVatRebate)
    .plus(input.decreasingAdjustments ?? 0)
    .plus(input.vdsWithheldOnSales ?? 0)
    .plus(input.openingRebateBalance ?? 0);

  const netBeforePayment = totalOutputTax.minus(totalCredits);
  const deposits = d(input.treasuryDeposits ?? 0);

  // If net is positive, that much is owed (less any deposits already made).
  // If net is negative, the surplus rebate carries forward to next period.
  const netAfterDeposits = netBeforePayment.minus(deposits);

  const netPayable = Decimal.max(netAfterDeposits, 0);
  const carryForward = Decimal.max(netAfterDeposits.negated(), 0);

  return {
    totalOutputTax: toBdt(totalOutputTax),
    totalRebateAndCredits: toBdt(totalCredits),
    netVatBeforePayment: toBdt(netBeforePayment),
    treasuryDeposits: toBdt(deposits),
    netPayable: toBdt(netPayable),
    carryForward: toBdt(carryForward),
  };
}
