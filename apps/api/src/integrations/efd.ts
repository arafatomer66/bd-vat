/**
 * EFD / SDC (Electronic Fiscal Device / Sales Data Controller) boundary.
 *
 * NBR mandates EFD/SDC for retail, restaurants and D2C e-commerce: the fiscal receipt
 * must be issued by an NBR-approved device, which then reports sales data to NBR. Those
 * devices are hardware/PKI integrations, so the default `NoFiscalDeviceAdapter` reports
 * that none is configured. A real `SdcDeviceAdapter` plugs in behind this interface.
 */

export interface FiscalInvoice {
  invoiceNo: string;
  buyerName?: string | null;
  buyerBin?: string | null;
  total: string;
  vat: string;
}

export interface FiscalReceiptResult {
  status: "ISSUED" | "UNCONFIGURED";
  receiptNo?: string;
  qrData?: string;
  deviceId?: string;
  message: string;
}

export interface FiscalDeviceAdapter {
  issue(invoice: FiscalInvoice): Promise<FiscalReceiptResult>;
}

export class NoFiscalDeviceAdapter implements FiscalDeviceAdapter {
  async issue(invoice: FiscalInvoice): Promise<FiscalReceiptResult> {
    return {
      status: "UNCONFIGURED",
      message:
        `No EFD/SDC device is configured for invoice ${invoice.invoiceNo}. Connect an ` +
        `NBR-approved EFD/SDC (or PKI/POS) to fiscalize sales; until then issue Mushak 6.3 only.`,
    };
  }
}

export function getFiscalAdapter(): FiscalDeviceAdapter {
  return new NoFiscalDeviceAdapter();
}
