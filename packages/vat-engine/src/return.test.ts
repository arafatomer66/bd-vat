import { describe, it, expect } from "vitest";
import { computeReturn } from "./return.js";

describe("computeReturn (Mushak 9.1)", () => {
  it("computes net payable = output VAT - input rebate", () => {
    const r = computeReturn({ outputVat: 150000, inputVatRebate: 90000 });
    expect(r.totalOutputTax).toBe("150000.00");
    expect(r.totalRebateAndCredits).toBe("90000.00");
    expect(r.netPayable).toBe("60000.00");
    expect(r.carryForward).toBe("0.00");
  });

  it("carries forward a surplus rebate when credits exceed output tax", () => {
    const r = computeReturn({ outputVat: 50000, inputVatRebate: 80000 });
    expect(r.netVatBeforePayment).toBe("-30000.00");
    expect(r.netPayable).toBe("0.00");
    expect(r.carryForward).toBe("30000.00");
  });

  it("reduces payable by VDS withheld on sales and treasury deposits", () => {
    const r = computeReturn({
      outputVat: 150000,
      inputVatRebate: 40000,
      vdsWithheldOnSales: 20000,
      treasuryDeposits: 30000,
    });
    // output 150000 - (rebate 40000 + vds 20000) = 90000; less 30000 deposit = 60000
    expect(r.netPayable).toBe("60000.00");
  });

  it("applies SD and increasing/decreasing adjustments and opening balance", () => {
    const r = computeReturn({
      outputVat: 100000,
      outputSd: 25000,
      increasingAdjustments: 5000,
      inputVatRebate: 30000,
      decreasingAdjustments: 10000,
      openingRebateBalance: 15000,
    });
    // output = 100000 + 25000 + 5000 = 130000
    // credits = 30000 + 10000 + 15000 = 55000
    expect(r.totalOutputTax).toBe("130000.00");
    expect(r.totalRebateAndCredits).toBe("55000.00");
    expect(r.netPayable).toBe("75000.00");
  });
});
