import { isDemoMode } from "./env";
import type {
  CreateExpenseInput,
  CreatePaymentInput,
  DashboardData,
  FinancialTransaction,
  MemberProfile,
} from "./types";

const API_NAMESPACE = "/wp-json/muwazana/v1";

function wordpressUrl(path: string): string {
  const base = process.env.WORDPRESS_BASE_URL?.replace(/\/$/, "");
  if (!base) throw new Error("WORDPRESS_BASE_URL is not configured");
  return `${base}${API_NAMESPACE}${path}`;
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

export function getDashboard(memberId: number): Promise<DashboardData> {
  return wpFetch<DashboardData>(`/members/${memberId}/dashboard`);
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
