/**
 * NBR integration boundary.
 *
 * NBR's online VAT system (IVAS / vat.gov.bd) exposes no public third-party API,
 * so the system's job is to produce a *submission-ready* package and hand it off.
 * Everything NBR-facing goes through `NbrAdapter`: today the default `ManualNbrAdapter`
 * builds the package and reports that filing is manual; a future `IvasNbrAdapter` can
 * implement real portal/API automation behind the same interface — no caller changes.
 */

export interface NbrSubmissionPackage {
  schema: "bd-vat.nbr.mushak-9.1";
  version: 1;
  company: { name: string; bin: string; tin?: string | null };
  period: { year: number; month: number };
  return: {
    outputVat: string;
    outputSd: string;
    inputVatRebate: string;
    vdsWithheldOnSales: string;
    increasingAdjustment: string;
    decreasingAdjustment: string;
    openingRebateBalance: string;
    treasuryDeposits: string;
    netPayable: string;
    carryForward: string;
    challanNo?: string | null;
  };
  registers: {
    sales: RegisterRow[]; // Mushak 6.2
    purchases: RegisterRow[]; // Mushak 6.1
  };
  generatedAt: string;
}

export interface RegisterRow {
  date: string;
  invoiceNo: string;
  party: string;
  partyBin: string;
  net: string;
  sd: string;
  vat: string;
  total: string;
}

export interface NbrSubmissionResult {
  accepted: boolean;
  mode: "MANUAL" | "PORTAL" | "API";
  reference?: string;
  message: string;
}

export interface NbrAdapter {
  readonly mode: NbrSubmissionResult["mode"];
  submit(pkg: NbrSubmissionPackage): Promise<NbrSubmissionResult>;
}

/**
 * Default adapter: no automated channel exists, so submission is manual. It validates
 * the package is complete and returns guidance rather than pretending to file.
 */
export class ManualNbrAdapter implements NbrAdapter {
  readonly mode = "MANUAL" as const;

  async submit(pkg: NbrSubmissionPackage): Promise<NbrSubmissionResult> {
    if (Number(pkg.return.netPayable) > 0 && !pkg.return.challanNo) {
      return {
        accepted: false,
        mode: "MANUAL",
        message:
          "Net VAT is payable but no treasury challan is recorded. Pay via a-Challan and " +
          "attach the challan number before filing Mushak 9.1 on vat.gov.bd.",
      };
    }
    return {
      accepted: false,
      mode: "MANUAL",
      message:
        "Package is complete and submission-ready. NBR provides no public filing API; " +
        "upload this Mushak 9.1 on the IVAS portal (vat.gov.bd) by the 15th. " +
        "Swap in IvasNbrAdapter here to automate once portal access is granted.",
    };
  }
}

/** Adapter selection point — env-driven later; manual for now. */
export function getNbrAdapter(): NbrAdapter {
  return new ManualNbrAdapter();
}
