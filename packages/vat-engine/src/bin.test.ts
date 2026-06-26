import { describe, it, expect } from "vitest";
import { isValidBin, normalizeBin, isValidTin } from "@bd-vat/shared";

describe("BIN / TIN validation", () => {
  it("accepts a 13-digit BIN, with spaces/dashes normalised", () => {
    expect(isValidBin("0001234567890")).toBe(true);
    expect(isValidBin("000123-456-7890")).toBe(true);
    expect(normalizeBin("000 123 456 7890")).toBe("0001234567890");
  });

  it("rejects malformed BINs", () => {
    expect(isValidBin("12345")).toBe(false);
    expect(isValidBin("00012345678AB")).toBe(false);
  });

  it("validates a 12-digit e-TIN", () => {
    expect(isValidTin("123456789012")).toBe(true);
    expect(isValidTin("12345")).toBe(false);
  });
});
