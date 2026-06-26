/**
 * Bangladesh VAT rates under the Value Added Tax and Supplementary Duty Act, 2012
 * (effective 1 July 2019), administered by the National Board of Revenue (NBR).
 *
 * The standard rate is 15%. The Act also allows a number of reduced ("truncated")
 * and specific rates for designated goods and services. These are configurable per
 * product/service, but the common statutory values are enumerated here.
 */

/** Standard VAT rate (15%). */
export const STANDARD_VAT_RATE = 0.15;

/**
 * Commonly used reduced / truncated VAT rates (as decimals).
 * The applicable rate depends on the SD/VAT schedule for the specific good or service.
 */
export const REDUCED_VAT_RATES = [0, 0.015, 0.025, 0.05, 0.075, 0.1] as const;

export type VatRate = number;

/** All statutorily recognised output VAT rates this system understands out of the box. */
export const KNOWN_VAT_RATES: readonly VatRate[] = [
  0, 0.015, 0.025, 0.05, 0.075, 0.1, STANDARD_VAT_RATE,
];

/**
 * VAT Deducted at Source (VDS / withholding VAT) — withholding entities deduct VAT
 * at source on certain supplies. The deducted portion is certified via Mushak 6.6.
 * The withholding rate is usually the full applicable VAT rate, but specific services
 * carry prescribed VDS rates; we keep it configurable per transaction.
 */
export const FULL_VDS_RATE = STANDARD_VAT_RATE;

/** Monthly return (Mushak 9.1) is due by the 15th day of the following month. */
export const RETURN_DUE_DAY_OF_MONTH = 15;
