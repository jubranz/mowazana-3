import type {
  CanonicalStatus,
  Installment,
  LoanStatus,
  LoanSummary,
  LoanTerms,
  ObligationSummary,
} from "./types";

const STATUS_MAP: Record<string, CanonicalStatus> = {
  pending: "pending",
  approved: "approved",
  approve: "approved",
  rejected: "rejected",
  decline: "rejected",
  declined: "rejected",
  on_hold: "on_hold",
  hold: "on_hold",
  "معلق": "on_hold",
  "معلّق": "on_hold",
  upcoming: "upcoming",
  "قادم": "upcoming",
  due: "due",
  "مستحق": "due",
  partial: "partial",
  "مدفوع جزئيا": "partial",
  "مدفوع جزئياً": "partial",
  paid: "paid",
  "مدفوع": "paid",
  overdue: "overdue",
  "متأخر": "overdue",
  carried_forward: "carried_forward",
  carried: "carried_forward",
  "مرحّل": "carried_forward",
  draft: "draft",
  "مسودة": "draft",
  active: "active",
  "نشط": "active",
  suspended: "suspended",
  "معلق القرض": "suspended",
  completed: "completed",
  "مكتمل": "completed",
  cancelled: "cancelled",
  canceled: "cancelled",
  "ملغي": "cancelled",
};

export function normalizeStatus(value: unknown): CanonicalStatus {
  if (typeof value !== "string") return "unknown";
  const normalized = value.trim().toLowerCase();
  if (!normalized || normalized === "undefined" || normalized === "null") return "unknown";
  return STATUS_MAP[normalized] ?? "unknown";
}

export interface BalanceParts {
  payments: number;
  rewards: number;
  expenses: number;
  penalties: number;
}

export function calculateBalance(parts: BalanceParts): number {
  return moneyRound(parts.payments + parts.rewards - parts.expenses - parts.penalties);
}

export function toAmount(value: unknown): number {
  const amount = typeof value === "number" ? value : Number.parseFloat(String(value ?? "0"));
  return Number.isFinite(amount) ? moneyRound(amount) : 0;
}

export function moneyRound(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function calculateLoanTerms(
  principalAmount: number,
  interestRate: number,
  installmentCount: number,
): LoanTerms {
  const principal = toAmount(principalAmount);
  const rate = toAmount(interestRate);
  const count = Math.max(1, Math.trunc(installmentCount));
  const interestAmount = moneyRound(principal * rate / 100);
  const totalAmount = moneyRound(principal + interestAmount);
  return {
    principalAmount: principal,
    interestRate: rate,
    interestAmount,
    totalAmount,
    remainingAmount: totalAmount,
    installmentCount: count,
    installmentAmount: moneyRound(totalAmount / count),
  };
}

export function splitInstallments(totalAmount: number, installmentCount: number): number[] {
  const total = toAmount(totalAmount);
  const count = Math.max(1, Math.trunc(installmentCount));
  const regular = moneyRound(total / count);
  const values = Array.from({ length: count }, () => regular);
  values[count - 1] = moneyRound(total - regular * (count - 1));
  return values;
}

function riyadhDateParts(date: Date): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Riyadh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  return { year: value("year"), month: value("month"), day: value("day") };
}

export function monthEndInRiyadh(asOf: Date = new Date()): string {
  const { year, month } = riyadhDateParts(asOf);
  const day = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function calculateObligations(
  balance: number,
  installments: Installment[],
  loans: Pick<LoanSummary, "id" | "status">[],
  asOf: Date = new Date(),
): ObligationSummary {
  const monthEnd = monthEndInRiyadh(asOf);
  const loanStatuses = new Map<number, LoanStatus | "unknown">(loans.map((loan) => [loan.id, loan.status]));
  const monthlyInstallments = moneyRound(installments.reduce((sum, installment) => {
    const payable = !["paid", "cancelled", "carried_forward"].includes(installment.status)
      && installment.dueDate <= monthEnd
      && (loanStatuses.get(installment.loanId) ?? "active") === "active";
    return payable ? sum + installment.remainingAmount : sum;
  }, 0));
  const debt = moneyRound(Math.max(0, -balance));
  return { debt, monthlyInstallments, monthlyRequired: moneyRound(debt + monthlyInstallments), monthEnd };
}

export function statusLabel(status: CanonicalStatus): string {
  const labels: Record<CanonicalStatus, string> = {
    pending: "قيد المراجعة",
    on_hold: "معلّقة",
    approved: "معتمد",
    rejected: "مرفوض",
    unknown: "غير محدد",
    upcoming: "قادم",
    due: "مستحق",
    partial: "مدفوع جزئيًا",
    paid: "مدفوع",
    overdue: "متأخر",
    carried_forward: "مرحّل للقادم",
    draft: "مسودة",
    active: "نشط",
    suspended: "معلّق",
    completed: "مكتمل",
    cancelled: "ملغي",
  };
  return labels[status];
}

/** Display-only status for a transaction whose accepted objection cancels a penalty. */
export function transactionDisplayStatus(transaction: { type: string; status: CanonicalStatus; objectionStatus?: string }): CanonicalStatus {
  return transaction.type === "penalty" && transaction.objectionStatus === "accepted" ? "cancelled" : transaction.status;
}
