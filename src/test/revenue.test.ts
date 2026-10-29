import { describe, expect, it } from "vitest";
import { calculateProfit } from "@/lib/revenue";

describe("automatic brand profit", () => {
  it("subtracts payout from budget", () => {
    expect(calculateProfit(100000, 65000)).toBe(35000);
  });
  it("retains losses when payout exceeds budget", () => {
    expect(calculateProfit(10000, 12000)).toBe(-2000);
  });
  it("calculates currency without fractional rounding errors", () => {
    expect(calculateProfit(100.30, 60.10)).toBe(40.20);
  });
});