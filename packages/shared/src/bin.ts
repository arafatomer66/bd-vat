/**
 * Business Identification Number (BIN) — issued by NBR on VAT registration.
 * Current BINs are 13 digits. We validate format only (NBR does not publish a
 * public checksum algorithm). National ID (NID) and TIN are validated elsewhere.
 */

const BIN_REGEX = /^\d{13}$/;

export function normalizeBin(raw: string): string {
  return raw.replace(/[\s-]/g, "");
}

export function isValidBin(raw: string): boolean {
  return BIN_REGEX.test(normalizeBin(raw));
}

/** 12-digit Taxpayer Identification Number (e-TIN). */
const TIN_REGEX = /^\d{12}$/;

export function isValidTin(raw: string): boolean {
  return TIN_REGEX.test(raw.replace(/[\s-]/g, ""));
}
