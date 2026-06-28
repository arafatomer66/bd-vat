/**
 * Treasury a-Challan verification boundary.
 *
 * Real verification happens at challanverification.finance.gov.bd, which has no public
 * API. So the default `ManualChallanAdapter` records that verification must be done by
 * hand and returns the public URL. An `AChallanApiAdapter` can implement automated
 * verification behind the same interface once API access exists.
 */

export interface ChallanVerifyResult {
  verified: boolean;
  mode: "MANUAL" | "API";
  note: string;
  verifyUrl?: string;
}

export interface ChallanAdapter {
  verify(challanNo: string, amount: number): Promise<ChallanVerifyResult>;
}

export class ManualChallanAdapter implements ChallanAdapter {
  async verify(challanNo: string, amount: number): Promise<ChallanVerifyResult> {
    return {
      verified: false,
      mode: "MANUAL",
      note:
        `Challan ${challanNo} (Tk ${amount.toFixed(2)}) recorded. Automated a-Challan ` +
        `verification has no public API — verify manually, then mark it verified.`,
      verifyUrl: "https://challanverification.finance.gov.bd/echalan/",
    };
  }
}

export function getChallanAdapter(): ChallanAdapter {
  return new ManualChallanAdapter();
}
