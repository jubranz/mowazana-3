import { z } from "zod";

const amount = z.number().finite().positive().max(99999999.99).multipleOf(0.01);
const requestId = z.string().min(16).max(64).regex(/^[a-zA-Z0-9-]+$/);
const optionalText = z.string().trim().max(240).optional().default("");
const optionalDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional();

export const pinLoginSchema = z.object({
  profileId: z.number().int().positive(),
  pin: z.string().regex(/^\d{6}$/),
});

export const expenseSchema = z.object({
  amount,
  category: z.enum(["بنزين", "مطعم", "تسوق", "تحويل", "نقدي", "أخرى"]),
  store: optionalText,
  note: optionalText,
  date: optionalDate,
  requestId,
});

export const paymentSchema = z
  .object({
    amount,
    targetType: z.enum(["general", "installment"]),
    installmentId: z.number().int().positive().optional(),
    note: optionalText,
    date: optionalDate,
    requestId,
  })
  .superRefine((value, context) => {
    if (value.targetType === "installment" && !value.installmentId) {
      context.addIssue({ code: "custom", path: ["installmentId"], message: "installmentId is required" });
    }
  });
