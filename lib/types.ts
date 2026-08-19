export type CanonicalStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "unknown"
  | "upcoming"
  | "due"
  | "partial"
  | "paid"
  | "overdue"
  | "active"
  | "completed"
  | "cancelled";

export type TransactionType = "expense" | "payment" | "reward" | "penalty" | "loan_payment";

export interface MemberProfile {
  id: number;
  name: string;
  initials: string;
  color: string;
}

export interface FinancialTransaction {
  id: number;
  type: TransactionType;
  title: string;
  amount: number;
  date: string;
  status: CanonicalStatus;
  note?: string;
}

export interface Installment {
  id: number;
  loanId: number;
  title: string;
  amount: number;
  paidAmount: number;
  remainingAmount: number;
  dueDate: string;
  status: CanonicalStatus;
}

export interface LoanSummary {
  id: number;
  title: string;
  totalAmount: number;
  remainingAmount: number;
  pendingPaymentAmount?: number;
  status: CanonicalStatus;
  nextInstallment: Installment | null;
}

export interface DashboardData {
  member: MemberProfile;
  balance: number;
  pendingAmount: number;
  totals: {
    expenses: number;
    payments: number;
    rewards: number;
    penalties: number;
  };
  loans: LoanSummary[];
  installments: Installment[];
  recent: FinancialTransaction[];
  demo?: boolean;
}

export interface CreateExpenseInput {
  amount: number;
  category: string;
  store?: string;
  note?: string;
  date?: string;
  requestId: string;
}

export interface CreatePaymentInput {
  amount: number;
  targetType: "general" | "installment";
  installmentId?: number;
  note?: string;
  date?: string;
  requestId: string;
}

export interface SessionPayload {
  memberId: number;
  name: string;
  color: string;
}
