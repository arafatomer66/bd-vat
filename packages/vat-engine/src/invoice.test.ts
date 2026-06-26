import { describe, it, expect } from "vitest";
import { computeInvoiceLine, computeInvoice } from "./invoice.js";

describe("computeInvoiceLine", () => {
  it("charges 15% standard VAT on a simple line", () => {
    const line = computeInvoiceLine({
      description: "Consulting",
      quantity: 1,
      unitPrice: 1000,
      vatRate: 0.15,
    });
    expect(line.netValue).toBe("1000.00");
    expect(line.vatAmount).toBe("150.00");
    expect(line.lineTotal).toBe("1150.00");
  });

  it("layers SD before VAT (VAT charged on value + SD)", () => {
    // SD 10% then VAT 15% on (1000 + 100)
    const line = computeInvoiceLine({
      description: "SD-liable good",
      quantity: 1,
      unitPrice: 1000,
      vatRate: 0.15,
      sdRate: 0.1,
    });
    expect(line.sdAmount).toBe("100.00");
    expect(line.vatableValue).toBe("1100.00");
    expect(line.vatAmount).toBe("165.00");
    expect(line.lineTotal).toBe("1265.00");
  });

  it("supports a truncated/reduced rate (5%)", () => {
    const line = computeInvoiceLine({
      description: "Reduced-rate service",
      quantity: 2,
      unitPrice: 500,
      vatRate: 0.05,
    });
    expect(line.netValue).toBe("1000.00");
    expect(line.vatAmount).toBe("50.00");
  });
});

describe("computeInvoice", () => {
  it("aggregates multiple lines with rounding", () => {
    const totals = computeInvoice([
      { description: "A", quantity: 3, unitPrice: 333.33, vatRate: 0.15 },
      { description: "B", quantity: 1, unitPrice: 99.99, vatRate: 0.15 },
    ]);
    expect(totals.netTotal).toBe("1099.98");
    expect(totals.vatTotal).toBe("165.00");
    expect(totals.grandTotal).toBe("1264.98");
  });
});
