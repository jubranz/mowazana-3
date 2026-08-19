import { describe, expect, it } from "vitest";
import { expenseSchema, paymentSchema, pinLoginSchema } from "@/lib/validation";

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
