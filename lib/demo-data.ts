import { calculateBalance } from "./finance";
import type {
  CreateExpenseInput,
  CreatePaymentInput,
  DashboardData,
  FinancialTransaction,
  MemberProfile,
} from "./types";

export const DEMO_PIN = "123456";

export const demoProfiles: MemberProfile[] = [
  { id: 101, name: "ريما", initials: "ري", color: "#f08a7e" },
  { id: 102, name: "سلمان", initials: "سل", color: "#6f8fe8" },
  { id: 103, name: "ليان", initials: "لي", color: "#9b7ad8" },
];

const baseTransactions: FinancialTransaction[] = [
  { id: 5001, type: "expense", title: "بنزين", amount: 180, date: "2026-08-18", status: "approved", note: "المحطة" },
  { id: 5002, type: "payment", title: "سداد عام", amount: 500, date: "2026-08-16", status: "approved" },
  { id: 5003, type: "expense", title: "تسوق", amount: 235, date: "2026-08-15", status: "pending", note: "احتياجات المنزل" },
  { id: 5004, type: "reward", title: "مكافأة", amount: 100, date: "2026-08-12", status: "approved" },
  { id: 5005, type: "penalty", title: "مخالفة", amount: 50, date: "2026-08-09", status: "approved" },
];

type DemoStore = { additions: Record<number, FinancialTransaction[]> };
const globalDemo = globalThis as typeof globalThis & { __muwazanaDemo?: DemoStore };
const store = (globalDemo.__muwazanaDemo ??= { additions: {} });

export function getDemoDashboard(memberId: number): DashboardData {
  const member = demoProfiles.find((profile) => profile.id === memberId) ?? demoProfiles[0];
  const recent = [...(store.additions[member.id] ?? []), ...baseTransactions];
  const approved = (type: FinancialTransaction["type"]) =>
    recent.filter((item) => item.type === type && item.status === "approved").reduce((sum, item) => sum + item.amount, 0);

  const totals = {
    expenses: 2030 + approved("expense"),
    payments: 500 + approved("payment"),
    rewards: approved("reward"),
    penalties: approved("penalty"),
  };

  return {
    member,
    balance: calculateBalance(totals),
    pendingAmount: recent.filter((item) => item.status === "pending").reduce((sum, item) => sum + item.amount, 0),
    totals,
    loans: [
      {
        id: 81,
        title: "جهاز الحاسب",
        totalAmount: 3600,
        remainingAmount: 1800,
        status: "active",
        nextInstallment: {
          id: 812,
          loanId: 81,
          title: "القسط السادس",
          amount: 600,
          paidAmount: 0,
          remainingAmount: 600,
          dueDate: "2026-08-27",
          status: "upcoming",
        },
      },
    ],
    installments: [
      {
        id: 812,
        loanId: 81,
        title: "جهاز الحاسب — القسط السادس",
        amount: 600,
        paidAmount: 0,
        remainingAmount: 600,
        dueDate: "2026-08-27",
        status: "upcoming",
      },
    ],
    recent: recent.slice(0, 12),
    demo: true,
  };
}

export function createDemoExpense(memberId: number, input: CreateExpenseInput): FinancialTransaction {
  return addDemoTransaction(memberId, {
    id: Date.now(),
    type: "expense",
    title: input.category,
    amount: input.amount,
    date: input.date ?? new Date().toISOString().slice(0, 10),
    status: "pending",
    note: [input.store, input.note].filter(Boolean).join(" — "),
  });
}

export function createDemoPayment(memberId: number, input: CreatePaymentInput): FinancialTransaction {
  return addDemoTransaction(memberId, {
    id: Date.now(),
    type: input.targetType === "installment" ? "loan_payment" : "payment",
    title: input.targetType === "installment" ? "سداد قسط" : "سداد عام",
    amount: input.amount,
    date: input.date ?? new Date().toISOString().slice(0, 10),
    status: "pending",
    note: input.note,
  });
}

function addDemoTransaction(memberId: number, transaction: FinancialTransaction): FinancialTransaction {
  store.additions[memberId] ??= [];
  store.additions[memberId].unshift(transaction);
  return transaction;
}
