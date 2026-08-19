import { describe, expect, it } from "vitest";
import { calculateBalance, normalizeStatus, toAmount } from "@/lib/finance";

describe("authoritative balance", () => {
  it("starts at zero", () => {
    expect(calculateBalance({ payments: 0, rewards: 0, expenses: 0, penalties: 0 })).toBe(0);
  });

  it("applies the Muwazana direction convention", () => {
    expect(calculateBalance({ payments: 700, rewards: 200, expenses: 1000, penalties: 100 })).toBe(-200);
  });

  it("does not receive a loans field, keeping loans outside the main balance", () => {
    expect(calculateBalance({ payments: 50, rewards: 0, expenses: 100, penalties: 0 })).toBe(-50);
  });

  it("rounds money to two decimal places", () => {
    expect(calculateBalance({ payments: 0.2, rewards: 0.1, expenses: 0, penalties: 0 })).toBe(0.3);
    expect(toAmount("135.678")).toBe(135.68);
  });
});

describe("legacy status normalization", () => {
  it.each([
    ["approved", "approved"],
    ["decline", "rejected"],
    ["", "unknown"],
    ["undefined", "unknown"],
    ["قادم", "upcoming"],
    ["مدفوع جزئياً", "partial"],
    ["متأخر", "overdue"],
    ["نشط", "active"],
  ])("maps %s to %s", (input, expected) => {
    expect(normalizeStatus(input)).toBe(expected);
  });
});
