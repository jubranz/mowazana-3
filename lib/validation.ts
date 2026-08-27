import { z } from "zod";

const amount = z.number().finite().positive().max(99999999.99).multipleOf(0.01);
const requestId = z.string().min(16).max(64).regex(/^[a-zA-Z0-9-]+$/);
const optionalText = z.string().trim().max(240).optional().default("");
const optionalDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional();

export const pinLoginSchema = z.object({
  profileId: z.union([z.string().uuid(), z.number().int().positive()]),
  pin: z.string().regex(/^\d{6}$/),
});

export const expenseSchema = z.object({
  amount,
  category: z.enum(["بنزين", "مطعم", "تسوق", "تحويل", "نقدي", "مكافأة", "أخرى"]),
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

const adminBase = z.object({
  memberId: z.number().int().positive(),
  amount,
  note: optionalText,
  date: optionalDate,
  requestId,
});

export const adminTransactionSchema = adminBase.extend({
  type: z.enum(["expense", "payment", "loan_payment", "reward", "penalty"]),
  category: z.string().trim().max(80).optional(),
  installmentId: z.number().int().positive().optional(),
  imageData: z.string().max(4_000_000).optional(),
}).superRefine((value, context) => {
  if (value.type === "loan_payment" && !value.installmentId) {
    context.addIssue({ code: "custom", path: ["installmentId"], message: "installmentId is required" });
  }
});

export const loanSchema = z.object({
  memberId: z.number().int().positive(),
  title: z.string().trim().min(2).max(100),
  principalAmount: amount,
  interestRate: z.number().finite().min(0).max(1000).multipleOf(0.01),
  installmentCount: z.number().int().min(1).max(240),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  status: z.enum(["draft", "active", "suspended", "cancelled"]),
  notes: optionalText,
  requestId,
});

export const adminActionSchema = z.object({
  note: z.string().trim().max(500).optional().default(""),
}).superRefine((value, context) => {
  if (value.note.length > 0 && value.note.length < 2) {
    context.addIssue({ code: "custom", path: ["note"], message: "note is too short" });
  }
});

export const adminEditTransactionSchema = z.object({
  amount: amount.optional(),
  title: z.string().trim().min(1).max(100).optional(),
  note: z.string().trim().max(240).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export const notificationReadSchema = z.object({
  id: z.number().int().positive().optional(),
  all: z.boolean().optional(),
}).refine((value) => value.all || value.id, { message: "id or all is required" });

export const penaltyObjectionSchema = z.object({
  text: z.string().trim().min(2).max(1000),
});
