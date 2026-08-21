import { calculateBalance, calculateLoanTerms, calculateObligations, splitInstallments } from "./finance";
import type {
  AdminDashboardData,
  CreateAdminTransactionInput,
  CreateExpenseInput,
  CreateLoanInput,
  CreatePaymentInput,
  DashboardData,
  FinancialTransaction,
  Installment,
  LoanSummary,
  MemberProfile,
  NotificationItem,
  PagedTransactions,
  TransactionStatus,
} from "./types";

export const DEMO_PIN = "123456";

export const demoProfiles: MemberProfile[] = [
  { id: 101, name: "ريما", initials: "ري", color: "#f08a7e", canManage: true },
  { id: 102, name: "سلمان", initials: "سل", color: "#6f8fe8", canManage: false },
  { id: 103, name: "ليان", initials: "لي", color: "#9b7ad8", canManage: false },
];

const baseTransactions: FinancialTransaction[] = [
  { id: 5001, memberId: 101, memberName: "ريما", type: "expense", title: "بنزين", amount: 180, date: "2026-08-18T18:40:00+03:00", status: "approved", note: "المحطة" },
  { id: 5002, memberId: 101, memberName: "ريما", type: "payment", title: "إيداع عام", amount: 500, date: "2026-08-16T11:25:00+03:00", status: "approved" },
  { id: 5003, memberId: 101, memberName: "ريما", type: "expense", title: "تسوق", amount: 235, date: "2026-08-15T20:10:00+03:00", status: "pending", note: "احتياجات المنزل" },
  { id: 5004, memberId: 101, memberName: "ريما", type: "reward", title: "مكافأة", amount: 100, date: "2026-08-12T09:05:00+03:00", status: "approved" },
  { id: 5005, memberId: 101, memberName: "ريما", type: "penalty", title: "مخالفة", amount: 50, date: "2026-08-09T14:15:00+03:00", status: "approved" },
  { id: 5010, memberId: 102, memberName: "سلمان", type: "expense", title: "تحويل", amount: 320, date: "2026-08-20T12:10:00+03:00", status: "on_hold", managerNote: "بانتظار الإيصال" },
];

type DemoState = {
  additions: FinancialTransaction[];
  statusOverrides: Record<string, TransactionStatus>;
  notifications: NotificationItem[];
  loans: Record<number, LoanSummary[]>;
  installments: Record<number, Installment[]>;
  objections: Record<string, { status: "pending" | "accepted" | "rejected"; text: string; decisionNote?: string }>;
};

const globalDemo = globalThis as typeof globalThis & { __muwazanaDemoV2?: DemoState };
const state = (globalDemo.__muwazanaDemoV2 ??= {
  additions: [],
  statusOverrides: {},
  notifications: [
    { id: 9001, event: "transaction.approved", title: "تم اعتماد العملية", body: "اعتمد المدير عملية إيداع عام بقيمة 500 ريال.", entityType: "payment", entityId: 5002, createdAt: "2026-08-16T11:40:00+03:00", readAt: null },
    { id: 9002, event: "installment.due", title: "قسط مستحق هذا الشهر", body: "قسط جهاز الحاسب مستحق في 27 أغسطس.", entityType: "loan_schedules", entityId: 812, createdAt: "2026-08-20T08:00:00+03:00", readAt: null },
  ],
  loans: {
    101: [{
      id: 81,
      title: "جهاز الحاسب",
      principalAmount: 3600,
      interestRate: 0,
      interestAmount: 0,
      totalAmount: 3600,
      remainingAmount: 1800,
      installmentCount: 6,
      installmentAmount: 600,
      startDate: "2026-03-27",
      status: "active",
      nextInstallment: null,
    }],
  },
  installments: {
    101: [
      { id: 812, loanId: 81, title: "قسط جهاز الحاسب — 4 من 6", number: 4, count: 6, baseAmount: 600, carryInAmount: 0, amount: 600, paidAmount: 0, remainingAmount: 600, dueDate: "2026-08-27", status: "upcoming" },
      { id: 813, loanId: 81, title: "قسط جهاز الحاسب — 5 من 6", number: 5, count: 6, baseAmount: 600, carryInAmount: 0, amount: 600, paidAmount: 0, remainingAmount: 600, dueDate: "2026-09-27", status: "upcoming" },
      { id: 814, loanId: 81, title: "قسط جهاز الحاسب — 6 من 6", number: 6, count: 6, baseAmount: 600, carryInAmount: 0, amount: 600, paidAmount: 0, remainingAmount: 600, dueDate: "2026-10-27", status: "upcoming" },
    ],
  },
  objections: {},
});

function allTransactions(): FinancialTransaction[] {
  return [...state.additions, ...baseTransactions]
    .map((item) => ({ ...item, status: state.statusOverrides[`${item.type}-${item.id}`] ?? item.status }))
    .map(withObjectionState)
    .sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
}

function memberTransactions(memberId: number): FinancialTransaction[] {
  return allTransactions().filter((item) => item.memberId === memberId).map(withObjectionState);
}

function withObjectionState(item: FinancialTransaction): FinancialTransaction {
  if (item.type !== "penalty") return item;
  const decision = state.objections[`${item.type}-${item.id}`];
  const deadline = new Date(Date.parse(item.date) + 15 * 86400000).toISOString();
  const canObject = item.status === "approved" && !decision && Date.now() <= Date.parse(deadline);
  return { ...item, objectionStatus: decision?.status ?? (Date.now() > Date.parse(deadline) ? "expired" : "none"), objectionText: decision?.text, objectionDeadline: deadline, canObject };
}

function memberLoans(memberId: number): { loans: LoanSummary[]; installments: Installment[] } {
  const installments = state.installments[memberId] ?? [];
  const loans = (state.loans[memberId] ?? []).map((loan) => ({
    ...loan,
    nextInstallment: installments
      .filter((item) => item.loanId === loan.id && !["paid", "cancelled", "carried_forward"].includes(item.status))
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0] ?? null,
  }));
  return { loans, installments };
}

export function getDemoDashboard(memberId: number): DashboardData {
  const member = demoProfiles.find((profile) => profile.id === memberId) ?? demoProfiles[0];
  const recent = memberTransactions(member.id);
  const approved = (type: FinancialTransaction["type"]) =>
    recent.filter((item) => item.type === type && item.status === "approved").reduce((sum, item) => sum + item.amount, 0);
  const totals = {
    expenses: 2030 + approved("expense"),
    payments: 500 + approved("payment"),
    rewards: approved("reward"),
    penalties: approved("penalty"),
  };
  const balance = calculateBalance(totals);
  const { loans, installments } = memberLoans(member.id);
  return {
    member,
    balance,
    pendingAmount: recent.filter((item) => ["pending", "on_hold"].includes(item.status)).reduce((sum, item) => sum + item.amount, 0),
    obligations: calculateObligations(balance, installments, loans),
    unreadNotifications: state.notifications.filter((item) => !item.managerOnly && !item.readAt).length,
    totals,
    loans,
    installments,
    recent: recent.slice(0, 25),
    demo: true,
  };
}

export function getDemoTransactions(memberId: number, status = "", page = 1, perPage = 5, scope = ""): PagedTransactions {
  const filtered = memberTransactions(memberId).filter((item) => {
    if (scope === "short" && item.type === "loan_payment") return false;
    if (status === "pending") return ["pending", "on_hold"].includes(item.status);
    return !status || item.status === status;
  });
  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const currentPage = Math.min(Math.max(1, page), totalPages);
  return {
    transactions: filtered.slice((currentPage - 1) * perPage, currentPage * perPage),
    page: currentPage,
    perPage,
    total: filtered.length,
    totalPages,
  };
}

export function createDemoExpense(memberId: number, input: CreateExpenseInput): FinancialTransaction {
  const profile = demoProfiles.find((item) => item.id === memberId);
  return addDemoTransaction({
    id: Date.now(), memberId, memberName: profile?.name, type: "expense", title: input.category,
    amount: input.amount, date: withTransactionTime(input.date), status: "pending",
    note: [input.store, input.note].filter(Boolean).join(" — "),
  });
}

export function createDemoPayment(memberId: number, input: CreatePaymentInput): FinancialTransaction {
  const profile = demoProfiles.find((item) => item.id === memberId);
  const installment = (state.installments[memberId] ?? []).find((item) => item.id === input.installmentId);
  return addDemoTransaction({
    id: Date.now(), memberId, memberName: profile?.name,
    type: input.targetType === "installment" ? "loan_payment" : "payment",
    installmentId: installment?.id, loanId: installment?.loanId,
    title: input.targetType === "installment" ? installment?.title ?? "إيداع قسط" : "إيداع عام",
    amount: input.amount, date: withTransactionTime(input.date), status: "pending", note: input.note,
  });
}

export function getDemoNotifications(managerOnly = false): NotificationItem[] {
  return state.notifications.filter((item) => Boolean(item.managerOnly) === managerOnly).sort((a, b) => b.id - a.id);
}

export function markDemoNotificationsRead(managerOnly: boolean, id?: number): void {
  state.notifications = state.notifications.map((item) => {
    if (Boolean(item.managerOnly) !== managerOnly || (id && item.id !== id)) return item;
    return { ...item, readAt: item.readAt ?? new Date().toISOString() };
  });
}

export function getDemoAdminDashboard(filters: { status?: string; type?: string; memberId?: number; page?: number; perPage?: number } = {}): AdminDashboardData {
  const perPage = filters.perPage ?? 8;
  const filtered = allTransactions().filter((item) =>
    (!filters.status || item.status === filters.status)
    && (!filters.type || item.type === filters.type)
    && (!filters.memberId || item.memberId === filters.memberId));
  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const page = Math.min(Math.max(1, filters.page ?? 1), totalPages);
  const allInstallments = Object.values(state.installments).flat();
  const notifications = getDemoNotifications(true);
  return {
    metrics: {
      pending: allTransactions().filter((item) => item.status === "pending").length,
      onHold: allTransactions().filter((item) => item.status === "on_hold").length,
      overdueInstallments: allInstallments.filter((item) => item.status === "overdue").length,
      activeLoans: Object.values(state.loans).flat().filter((loan) => loan.status === "active").length,
    },
    profiles: demoProfiles,
    installments: allInstallments.map((item) => ({
      ...item,
      memberId: Number(Object.entries(state.installments).find(([, values]) => values.some((candidate) => candidate.id === item.id))?.[0] ?? 0),
    })),
    transactions: { transactions: filtered.slice((page - 1) * perPage, page * perPage), page, perPage, total: filtered.length, totalPages },
    notifications,
    unreadNotifications: notifications.filter((item) => !item.readAt).length,
    demo: true,
  };
}

export function createDemoAdminTransaction(input: CreateAdminTransactionInput, actorId: number): FinancialTransaction {
  const profile = demoProfiles.find((item) => item.id === input.memberId);
  const installment = (state.installments[input.memberId] ?? []).find((item) => item.id === input.installmentId);
  const transaction = addDemoTransaction({
    id: Date.now(), memberId: input.memberId, memberName: profile?.name, type: input.type,
    title: input.type === "expense" ? input.category ?? "سحب" : input.type === "loan_payment" ? installment?.title ?? "إيداع قسط" : input.type === "reward" ? input.category ?? "مكافأة" : input.type === "penalty" ? input.category ?? "مخالفة" : "إيداع عام",
    amount: input.amount, date: withTransactionTime(input.date), status: "approved", note: input.note,
    installmentId: installment?.id, loanId: installment?.loanId,
  });
  addNotification(input.memberId, input.type === "reward" ? "member.reward.created" : input.type === "penalty" ? "member.penalty.created" : "transaction.approved", input.type === "reward" ? "تمت إضافة مكافأة" : input.type === "penalty" ? "تمت إضافة مخالفة" : "عملية أضافها المدير", `أضاف المدير عملية ${transaction.title} واعتمدها مباشرة.`, false, transaction);
  void actorId;
  return transaction;
}

export function submitDemoPenaltyObjection(memberId: number, id: number, text: string): FinancialTransaction | null {
  const transaction = allTransactions().find((item) => item.type === "penalty" && item.id === id && item.memberId === memberId);
  const hydrated = transaction ? withObjectionState(transaction) : null;
  if (!hydrated?.canObject) return null;
  state.objections[`penalty-${id}`] = { status: "pending", text };
  addNotification(101, "penalty.objection.created", "اعتراض جديد على مخالفة", `قدّم ${hydrated.memberName ?? "العضو"} اعتراضًا على ${hydrated.title}.`, true, hydrated);
  return withObjectionState({ ...hydrated, objectionStatus: "pending", objectionText: text, canObject: false });
}

export function decideDemoPenaltyObjection(id: number, action: "accept" | "reject", note: string): FinancialTransaction | null {
  const transaction = allTransactions().find((item) => item.type === "penalty" && item.id === id);
  const current = transaction ? state.objections[`penalty-${id}`] : undefined;
  if (!transaction || !current || current.status !== "pending") return null;
  state.objections[`penalty-${id}`] = { ...current, status: action === "accept" ? "accepted" : "rejected", decisionNote: note };
  addNotification(transaction.memberId ?? 0, `penalty.objection.${action}`, action === "accept" ? "تم قبول اعتراضك" : "تم رفض اعتراضك", note || transaction.title, false, transaction);
  return withObjectionState({ ...transaction, objectionStatus: state.objections[`penalty-${id}`].status, objectionText: current.text, canObject: false });
}

export function transitionDemoTransaction(type: string, id: number, action: "approve" | "hold" | "reject", note: string): FinancialTransaction | null {
  const transaction = allTransactions().find((item) => item.type === type && item.id === id);
  if (!transaction || !["pending", "on_hold"].includes(transaction.status)) return null;
  const next: TransactionStatus = action === "approve" ? "approved" : action === "hold" ? "on_hold" : "rejected";
  state.statusOverrides[`${type}-${id}`] = next;
  addNotification(transaction.memberId ?? 0, `transaction.${next}`, next === "approved" ? "تم اعتماد العملية" : next === "on_hold" ? "تم تعليق العملية" : "تم رفض العملية", note || `أصبحت حالة ${transaction.title}: ${next}.`, false, transaction);
  return { ...transaction, status: next, managerNote: note };
}

export function editDemoTransaction(type: string, id: number, input: Partial<Pick<FinancialTransaction, "amount" | "title" | "note" | "date">>): FinancialTransaction | null {
  const index = state.additions.findIndex((item) => item.type === type && item.id === id);
  const base = index >= 0 ? state.additions[index] : baseTransactions.find((item) => item.type === type && item.id === id);
  if (!base || !["pending", "on_hold"].includes(state.statusOverrides[`${type}-${id}`] ?? base.status)) return null;
  const updated = { ...base, ...input };
  if (index >= 0) state.additions[index] = updated;
  else {
    state.additions.unshift(updated);
    state.statusOverrides[`${type}-${id}`] = updated.status as TransactionStatus;
  }
  return updated;
}

export function createDemoLoan(input: CreateLoanInput): LoanSummary {
  const terms = calculateLoanTerms(input.principalAmount, input.interestRate, input.installmentCount);
  const loanId = Date.now();
  const loan: LoanSummary = {
    id: loanId, title: input.title, ...terms, startDate: input.startDate, notes: input.notes,
    status: input.status, nextInstallment: null,
  };
  state.loans[input.memberId] ??= [];
  state.loans[input.memberId].unshift(loan);
  if (input.status === "active") {
    const amounts = splitInstallments(terms.totalAmount, terms.installmentCount);
    state.installments[input.memberId] ??= [];
    const start = new Date(`${input.startDate}T12:00:00Z`);
    amounts.forEach((value, index) => {
      const due = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + index, start.getUTCDate()));
      state.installments[input.memberId].push({
        id: loanId + index + 1, loanId, title: `قسط ${input.title} — ${index + 1} من ${amounts.length}`,
        number: index + 1, count: amounts.length, baseAmount: value, carryInAmount: 0,
        amount: value, paidAmount: 0, remainingAmount: value, dueDate: due.toISOString().slice(0, 10), status: "upcoming",
      });
    });
  }
  addNotification(input.memberId, "loan.created", "تمت إضافة قرض جديد", `أضاف المدير ${input.title} بإجمالي ${terms.totalAmount} ريال.`, false, { id: loanId, type: "loan_payment" } as FinancialTransaction);
  return loan;
}

function withTransactionTime(date?: string): string {
  const selectedDate = date ?? new Date().toISOString().slice(0, 10);
  return `${selectedDate}T${new Date().toTimeString().slice(0, 8)}+03:00`;
}

function addDemoTransaction(transaction: FinancialTransaction): FinancialTransaction {
  state.additions.unshift(transaction);
  if (transaction.status === "pending") {
    addNotification(101, "transaction.created", "عملية جديدة للمراجعة", `${transaction.memberName ?? "عضو"}: ${transaction.title}`, true, transaction);
  }
  return transaction;
}

function addNotification(recipientId: number, event: string, title: string, body: string, managerOnly: boolean, transaction: FinancialTransaction): void {
  void recipientId;
  state.notifications.unshift({
    id: Date.now() + state.notifications.length,
    event, title, body, entityType: transaction.type, entityId: transaction.id,
    createdAt: new Date().toISOString(), readAt: null, managerOnly, payload: { transaction },
  });
}
