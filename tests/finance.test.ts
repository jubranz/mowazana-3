import { describe, expect, it } from "vitest";
import { calculateBalance, calculateLoanTerms, calculateObligations, normalizeStatus, splitInstallments, toAmount } from "@/lib/finance";

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
    ["on_hold", "on_hold"],
    ["مرحّل", "carried_forward"],
    ["مسودة", "draft"],
  ])("maps %s to %s", (input, expected) => {
    expect(normalizeStatus(input)).toBe(expected);
  });
});

describe("monthly obligations", () => {
  const loans = [
    { id: 1, status: "active" as const },
    { id: 2, status: "suspended" as const },
  ];

  it("combines negative general balance with current and overdue installments", () => {
    const installments = [
      { id: 1, loanId: 1, title: "متأخر", amount: 100, paidAmount: 0, remainingAmount: 100, dueDate: "2026-07-10", status: "overdue" as const },
      { id: 2, loanId: 1, title: "الحالي", amount: 200, paidAmount: 50, remainingAmount: 150, dueDate: "2026-08-28", status: "partial" as const },
      { id: 3, loanId: 1, title: "مستقبلي", amount: 300, paidAmount: 0, remainingAmount: 300, dueDate: "2026-09-01", status: "upcoming" as const },
      { id: 4, loanId: 1, title: "مرحّل", amount: 90, paidAmount: 40, remainingAmount: 0, dueDate: "2026-08-01", status: "carried_forward" as const },
      { id: 5, loanId: 2, title: "قرض معلق", amount: 500, paidAmount: 0, remainingAmount: 500, dueDate: "2026-08-02", status: "due" as const },
    ];
    expect(calculateObligations(-250, installments, loans, new Date("2026-08-21T09:00:00Z"))).toEqual({
      debt: 250,
      monthlyInstallments: 250,
      monthlyRequired: 500,
      monthEnd: "2026-08-31",
    });
  });

  it("does not use positive credit to reduce installment obligations", () => {
    const installments = [{ id: 1, loanId: 1, title: "قسط", amount: 100, paidAmount: 0, remainingAmount: 100, dueDate: "2026-08-30", status: "upcoming" as const }];
    expect(calculateObligations(300, installments, loans, new Date("2026-08-21T09:00:00Z")).monthlyRequired).toBe(100);
  });
});

describe("flat-interest loan terms", () => {
  it("calculates the fixed interest and exact final rounding installment", () => {
    expect(calculateLoanTerms(10_000, 10, 3)).toEqual({
      principalAmount: 10_000,
      interestRate: 10,
      interestAmount: 1_000,
      totalAmount: 11_000,
      remainingAmount: 11_000,
      installmentCount: 3,
      installmentAmount: 3666.67,
    });
    expect(splitInstallments(100, 3)).toEqual([33.33, 33.33, 33.34]);
    expect(splitInstallments(100, 3).reduce((sum, value) => sum + value, 0)).toBe(100);
  });
});
