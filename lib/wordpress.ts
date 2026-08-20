import { isDemoMode } from "./env";
import type {
  CreateExpenseInput,
  CreatePaymentInput,
  DashboardData,
  FinancialTransaction,
  MemberProfile,
  TransactionType,
} from "./types";

const API_NAMESPACE = "/wp-json/muwazana/v1";
const CCT_SLUG_BY_TRANSACTION_TYPE: Partial<Record<TransactionType, string>> = {
  expense: "expense",
  payment: "payment",
  penalty: "penalty",
  loan_payment: "loan_payments",
};

function wordpressUrl(path: string): string {
  const base = process.env.WORDPRESS_BASE_URL?.replace(/\/$/, "");
  if (!base) throw new Error("WORDPRESS_BASE_URL is not configured");
  return `${base}${API_NAMESPACE}${path}`;
}

function wordpressRootUrl(path: string): string {
  const base = process.env.WORDPRESS_BASE_URL?.replace(/\/$/, "");
  if (!base) throw new Error("WORDPRESS_BASE_URL is not configured");
  return `${base}${path}`;
}

function authorizationHeader(): string {
  const username = process.env.WORDPRESS_APP_USERNAME;
  const password = process.env.WORDPRESS_APP_PASSWORD;
  if (!username || !password) throw new Error("WordPress service credentials are not configured");
  return `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
}

async function wpFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (isDemoMode()) throw new Error("WordPress calls are disabled in demo mode");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(wordpressUrl(path), {
      ...init,
      cache: "no-store",
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        Authorization: authorizationHeader(),
        "Content-Type": "application/json",
        ...(init.headers ?? {}),
      },
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = typeof body?.message === "string" ? body.message : `WordPress request failed (${response.status})`;
      throw new Error(message);
    }
    return body as T;
  } finally {
    clearTimeout(timeout);
  }
}

export function getProfiles(): Promise<MemberProfile[]> {
  return wpFetch<MemberProfile[]>("/profiles");
}

export function verifyMemberPin(profileId: number, pin: string, clientKey: string): Promise<MemberProfile> {
  return wpFetch<MemberProfile>("/auth/pin", {
    method: "POST",
    body: JSON.stringify({ memberId: profileId, pin, clientKey }),
  });
}

export async function getDashboard(memberId: number): Promise<DashboardData> {
  const dashboard = await wpFetch<DashboardData>(`/members/${memberId}/dashboard`);
  const recent = await hydrateTransactionTimes(memberId, dashboard.recent);
  return { ...dashboard, recent };
}

export function getTransactions(memberId: number, search = ""): Promise<FinancialTransaction[]> {
  const suffix = search ? `?${search}` : "";
  return wpFetch<FinancialTransaction[]>(`/members/${memberId}/transactions${suffix}`);
}

export function createExpense(memberId: number, input: CreateExpenseInput): Promise<FinancialTransaction> {
  return wpFetch<FinancialTransaction>(`/members/${memberId}/expenses`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function createPayment(memberId: number, input: CreatePaymentInput): Promise<FinancialTransaction> {
  return wpFetch<FinancialTransaction>(`/members/${memberId}/payments`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

async function hydrateTransactionTimes(memberId: number, transactions: FinancialTransaction[]): Promise<FinancialTransaction[]> {
  const requiredTypes = [...new Set(transactions.map((transaction) => transaction.type))]
    .filter((type): type is keyof typeof CCT_SLUG_BY_TRANSACTION_TYPE => Boolean(CCT_SLUG_BY_TRANSACTION_TYPE[type]));
  if (!requiredTypes.length) return transactions;

  const rowsByType = await Promise.all(requiredTypes.map(async (type) => [
    type,
    await getCctRows(CCT_SLUG_BY_TRANSACTION_TYPE[type]!, memberId),
  ] as const));
  const createdAtByTransaction = new Map<string, string>();
  for (const [type, rows] of rowsByType) {
    for (const row of rows) {
      const id = Number(row._ID ?? row.id ?? 0);
      const createdAt = String(row.cct_created ?? row.created_at ?? "");
      if (id && createdAt) createdAtByTransaction.set(`${type}-${id}`, createdAt);
    }
  }

  return transactions.map((transaction) => ({
    ...transaction,
    date: transactionDateTime(transaction.date, createdAtByTransaction.get(`${transaction.type}-${transaction.id}`)),
  }));
}

async function getCctRows(slug: string, memberId: number): Promise<Record<string, unknown>[]> {
  try {
    const response = await fetch(wordpressRootUrl(`/wp-json/jet-cct/${slug}/?cct_author_id=${memberId}`), {
      cache: "no-store",
      headers: { Accept: "application/json", Authorization: authorizationHeader() },
    });
    if (!response.ok) return [];
    const body = await response.json().catch(() => []);
    if (Array.isArray(body)) return body as Record<string, unknown>[];
    if (body && typeof body === "object" && Array.isArray((body as { items?: unknown }).items)) {
      return (body as { items: Record<string, unknown>[] }).items;
    }
    return [];
  } catch {
    return [];
  }
}

function transactionDateTime(date: string, createdAt?: string): string {
  if (date.includes("T") || !createdAt) return date;
  const time = createdAt.match(/(?:T|\s)(\d{2}:\d{2}(?::\d{2})?)/)?.[1];
  return time ? `${date}T${time}+03:00` : date;
}
