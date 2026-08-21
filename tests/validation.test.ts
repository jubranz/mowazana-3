import { describe, expect, it } from "vitest";
import { adminTransactionSchema, expenseSchema, loanSchema, paymentSchema, pinLoginSchema } from "@/lib/validation";

const requestId = "0b6214cb-1aa6-4b72-9f4b-041ddac7e05f";

describe("member input validation", () => {
  it("requires a six digit PIN", () => {
    expect(pinLoginSchema.safeParse({ profileId: 2, pin: "123456" }).success).toBe(true);
    expect(pinLoginSchema.safeParse({ profileId: 2, pin: "1234" }).success).toBe(false);
  });

  it("accepts a positive, two-decimal expense", () => {
    expect(expenseSchema.safeParse({ amount: 10.25, category: "بنزين", requestId }).success).toBe(true);
    expect(expenseSchema.safeParse({ amount: -1, category: "بنزين", requestId }).success).toBe(false);
  });

  it("requires an installment id only for installment payments", () => {
    expect(paymentSchema.safeParse({ amount: 100, targetType: "general", requestId }).success).toBe(true);
    expect(paymentSchema.safeParse({ amount: 100, targetType: "installment", requestId }).success).toBe(false);
    expect(paymentSchema.safeParse({ amount: 100, targetType: "installment", installmentId: 42, requestId }).success).toBe(true);
  });
});

describe("manager input validation", () => {
  it("requires an installment for an administrative loan payment", () => {
    const base = { memberId: 2, type: "loan_payment", amount: 100, requestId };
    expect(adminTransactionSchema.safeParse(base).success).toBe(false);
    expect(adminTransactionSchema.safeParse({ ...base, installmentId: 4 }).success).toBe(true);
  });

  it("accepts fixed-interest loan terms and rejects invalid schedules", () => {
    const loan = { memberId: 2, title: "الآيفون", principalAmount: 5000, interestRate: 10, installmentCount: 12, startDate: "2026-09-01", status: "active", requestId };
    expect(loanSchema.safeParse(loan).success).toBe(true);
    expect(loanSchema.safeParse({ ...loan, installmentCount: 0 }).success).toBe(false);
    expect(loanSchema.safeParse({ ...loan, interestRate: -1 }).success).toBe(false);
  });
});
