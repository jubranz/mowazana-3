export type TransactionStatus = "pending" | "on_hold" | "approved" | "rejected";
export type InstallmentStatus =
  | "upcoming"
  | "due"
  | "overdue"
  | "partial"
  | "paid"
  | "carried_forward"
  | "cancelled";
export type LoanStatus = "draft" | "active" | "suspended" | "completed" | "cancelled";

/** Kept as the read-boundary union while legacy WordPress rows are normalized. */
export type CanonicalStatus = TransactionStatus | InstallmentStatus | LoanStatus | "unknown";
export type TransactionType = "expense" | "payment" | "reward" | "penalty" | "loan_payment";

export interface MemberProfile {
  id: number;
  name: string;
  initials: string;
  color: string;
  canManage?: boolean;
}

export interface FinancialTransaction {
  id: number;
  type: TransactionType;
  title: string;
  amount: number;
  /** ISO date-time, preserving the original transaction time when available. */
  date: string;
  status: TransactionStatus | "unknown";
  note?: string;
  managerNote?: string;
  memberId?: number;
  memberName?: string;
  loanId?: number;
  installmentId?: number;
  imageUrl?: string;
}

export interface Installment {
  id: number;
  loanId: number;
  title: string;
  number?: number;
  count?: number;
  baseAmount?: number;
  carryInAmount?: number;
  amount: number;
  paidAmount: number;
  remainingAmount: number;
  dueDate: string;
  status: InstallmentStatus | "unknown";
  hasPendingPayment?: boolean;
  memberId?: number;
}

export interface LoanSummary {
  id: number;
  title: string;
  principalAmount?: number;
  interestRate?: number;
  interestAmount?: number;
  totalAmount: number;
  remainingAmount: number;
  installmentCount?: number;
  installmentAmount?: number;
  startDate?: string;
  notes?: string;
  pendingPaymentAmount?: number;
  status: LoanStatus | "unknown";
  nextInstallment: Installment | null;
}

export interface ObligationSummary {
  debt: number;
  monthlyInstallments: number;
  monthlyRequired: number;
  monthEnd: string;
}

export interface DashboardData {
  member: MemberProfile;
  balance: number;
  pendingAmount: number;
  obligations: ObligationSummary;
  unreadNotifications: number;
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

export interface NotificationItem {
  id: number;
  event: string;
  title: string;
  body: string;
  entityType?: string;
  entityId?: number;
  createdAt: string;
  readAt?: string | null;
  managerOnly?: boolean;
}

export interface PagedTransactions {
  transactions: FinancialTransaction[];
  page: number;
  perPage: number;
  total: number;
  totalPages: number;
}

export interface AdminMetrics {
  pending: number;
  onHold: number;
  overdueInstallments: number;
  activeLoans: number;
}

export interface AdminDashboardData {
  metrics: AdminMetrics;
  profiles: MemberProfile[];
  installments: Installment[];
  transactions: PagedTransactions;
  notifications: NotificationItem[];
  unreadNotifications: number;
  demo?: boolean;
}

export interface LoanTerms {
  principalAmount: number;
  interestRate: number;
  interestAmount: number;
  totalAmount: number;
  remainingAmount: number;
  installmentCount: number;
  installmentAmount: number;
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

export interface CreateAdminTransactionInput {
  memberId: number;
  type: "expense" | "payment" | "loan_payment" | "reward" | "penalty";
  amount: number;
  category?: string;
  installmentId?: number;
  note?: string;
  date?: string;
  requestId: string;
  /** Data URL for a manager-provided evidence image. Sent only to the server. */
  imageData?: string;
}

export interface CreateLoanInput {
  memberId: number;
  title: string;
  principalAmount: number;
  interestRate: number;
  installmentCount: number;
  startDate: string;
  status: "draft" | "active" | "suspended" | "cancelled";
  notes?: string;
  requestId: string;
}

export interface SessionPayload {
  memberId: number;
  name: string;
  color: string;
  canManage: boolean;
}
