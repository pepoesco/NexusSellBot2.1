import { describe, expect, it } from "vitest";
import { centsToDecimal, moneyToCents } from "../src/utils/money.js";

describe("money helpers", () => {
  it("converts decimal values to cents safely", () => {
    expect(moneyToCents(29.9)).toBe(2990);
    expect(moneyToCents(0.01)).toBe(1);
  });

  it("formats cents as decimal strings for gateways", () => {
    expect(centsToDecimal(2990)).toBe("29.90");
  });
});
