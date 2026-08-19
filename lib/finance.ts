import type { CanonicalStatus } from "./types";

const STATUS_MAP: Record<string, CanonicalStatus> = {
  pending: "pending",
  approved: "approved",
  approve: "approved",
  rejected: "rejected",
  decline: "rejected",
  declined: "rejected",
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
  active: "active",
  "نشط": "active",
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
  const result = parts.payments + parts.rewards - parts.expenses - parts.penalties;
  return Math.round((result + Number.EPSILON) * 100) / 100;
}

export function toAmount(value: unknown): number {
  const amount = typeof value === "number" ? value : Number.parseFloat(String(value ?? "0"));
  if (!Number.isFinite(amount)) return 0;
  return Math.round((amount + Number.EPSILON) * 100) / 100;
}

export function statusLabel(status: CanonicalStatus): string {
  const labels: Record<CanonicalStatus, string> = {
    pending: "قيد المراجعة",
    approved: "معتمد",
    rejected: "مرفوض",
    unknown: "غير محدد",
    upcoming: "قادم",
    due: "مستحق",
    partial: "مدفوع جزئيًا",
    paid: "مدفوع",
    overdue: "متأخر",
    active: "نشط",
    completed: "مكتمل",
    cancelled: "ملغي",
  };
  return labels[status];
}
