"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import {
  ArrowLeft,
  ArrowLeftRight,
  Delete as Backspace,
  Banknote,
  Bell,
  CalendarClock,
  Check,
  ChevronLeft,
  Download,
  Fuel,
  Gift,
  HandCoins,
  LogOut,
  ListTree,
  LayoutDashboard,
  MessageCircleWarning,
  MoreHorizontal,
  Plus,
  RefreshCw,
  ShieldCheck,
  ShoppingBag,
  TriangleAlert,
  Utensils,
  WalletCards,
  WifiOff,
  X,
} from "lucide-react";
import { AdminDashboard } from "@/components/admin-dashboard";
import { NotificationsPage } from "@/components/notifications-page";
import { statusLabel } from "@/lib/finance";
import type {
  CanonicalStatus,
  DashboardData,
  FinancialTransaction,
  MemberProfile,
  PagedTransactions,
  TransactionStatus,
} from "@/lib/types";

type Screen = "loading" | "profiles" | "pin" | "dashboard" | "loans" | "notifications" | "admin";
type SheetKind = "expense" | "payment" | "loanPayment" | null;

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const categories = [
  { label: "بنزين", icon: Fuel },
  { label: "مطعم", icon: Utensils },
  { label: "تسوق", icon: ShoppingBag },
  { label: "تحويل", icon: ArrowLeftRight },
  { label: "نقدي", icon: Banknote },
  { label: "مكافأة", icon: Gift },
  { label: "أخرى", icon: MoreHorizontal },
] as const;

const moneyFormatter = new Intl.NumberFormat("ar-SA", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

const dateFormatter = new Intl.DateTimeFormat("ar-SA-u-ca-gregory", { day: "numeric", month: "short", year: "numeric" });
const dateTimeFormatter = new Intl.DateTimeFormat("ar-SA-u-ca-gregory", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Asia/Riyadh" });

function money(value: number): string {
  return moneyFormatter.format(Math.abs(value));
}

function Money({ value, sign }: { value: number; sign?: "+" | "−" }) {
  return <span className="money" dir="ltr"><Image src="/assets/saudi-riyal.svg" alt="ريال" width={12} height={14} /><bdi>{sign}{money(value)}</bdi></span>;
}

function prettyDate(value: string): string {
  const date = new Date(value.includes("T") ? value : `${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? value : dateFormatter.format(date);
}

function prettyDateTime(value: string): string {
  if (!value.includes("T")) return prettyDate(value);
  const date = new Date(value.includes("T") ? value : `${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? value : dateTimeFormatter.format(date);
}

function todayInRiyadh(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Riyadh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

async function readJson<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error ?? "حدث خطأ غير متوقع.");
  return payload as T;
}

export function MuwazanaApp() {
  const [screen, setScreen] = useState<Screen>("loading");
  const [profiles, setProfiles] = useState<MemberProfile[]>([]);
  const [selectedProfile, setSelectedProfile] = useState<MemberProfile | null>(null);
  const [pin, setPin] = useState("");
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [sheet, setSheet] = useState<SheetKind>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [demo, setDemo] = useState(false);
  const [offline, setOffline] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [transactionPage, setTransactionPage] = useState(1);
  const [transactionTab, setTransactionTab] = useState<Extract<TransactionStatus, "approved" | "pending" | "rejected">>("approved");
  const [transactionData, setTransactionData] = useState<PagedTransactions>({ transactions: [], page: 1, perPage: 5, total: 0, totalPages: 1 });
  const [transactionsBusy, setTransactionsBusy] = useState(false);
  const transactionsPerPage = 5;

  const loadDashboard = useCallback(async (silent = false) => {
    if (!silent) setBusy(true);
    try {
      const response = await fetch("/api/me/dashboard", { cache: "no-store" });
      if (response.status === 401) return false;
      const data = await readJson<DashboardData>(response);
      setDashboard(data);
      setDemo(Boolean(data.demo));
      setScreen((current) => current === "loans" ? "loans" : "dashboard");
      return true;
    } catch (cause) {
      if (!silent) setError(cause instanceof Error ? cause.message : "تعذر تحميل البيانات.");
      return false;
    } finally {
      if (!silent) setBusy(false);
    }
  }, []);

  const loadTransactions = useCallback(async (status: string, page: number) => {
    setTransactionsBusy(true);
    try {
      const result = await readJson<PagedTransactions>(await fetch(`/api/me/transactions?scope=short&status=${status}&page=${page}&perPage=${transactionsPerPage}`, { cache: "no-store" }));
      setTransactionData(result);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر تحميل العمليات.");
    } finally { setTransactionsBusy(false); }
  }, []);

  const loadProfiles = useCallback(async () => {
    setBusy(true);
    try {
      const data = await readJson<{ profiles: MemberProfile[]; demo: boolean }>(
        await fetch("/api/profiles", { cache: "no-store" }),
      );
      setProfiles(data.profiles);
      setDemo(data.demo);
      setScreen("profiles");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر تحميل الأعضاء.");
      setScreen("profiles");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void (async () => {
      const signedIn = await loadDashboard(true);
      if (!signedIn) await loadProfiles();
    })();
  }, [loadDashboard, loadProfiles]);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" }).then((registration) => registration.update()).catch(() => undefined);
    }
    const onInstall = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };
    const setNetwork = () => setOffline(!navigator.onLine);
    window.addEventListener("beforeinstallprompt", onInstall);
    window.addEventListener("online", setNetwork);
    window.addEventListener("offline", setNetwork);
    setNetwork();
    return () => {
      window.removeEventListener("beforeinstallprompt", onInstall);
      window.removeEventListener("online", setNetwork);
      window.removeEventListener("offline", setNetwork);
    };
  }, []);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible" && ["dashboard", "loans"].includes(screen)) void loadDashboard(true);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [loadDashboard, screen]);

  useEffect(() => {
    if (!dashboard || screen !== "dashboard") return;
    const timer = window.setTimeout(() => void loadTransactions(transactionTab, transactionPage), 0);
    return () => window.clearTimeout(timer);
  }, [dashboard, loadTransactions, screen, transactionPage, transactionTab]);

  async function submitPin(value: string) {
    if (!selectedProfile || value.length !== 6 || busy) return;
    setBusy(true);
    setError("");
    try {
      await readJson(
        await fetch("/api/auth/pin", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ profileId: selectedProfile.id, pin: value }),
        }),
      );
      await loadDashboard(true);
    } catch (cause) {
      setPin("");
      setError(cause instanceof Error ? cause.message : "الرمز غير صحيح.");
    } finally {
      setBusy(false);
    }
  }

  function pressPin(key: string) {
    setError("");
    if (key === "back") return setPin((value) => value.slice(0, -1));
    if (pin.length >= 6 || busy) return;
    const next = `${pin}${key}`;
    setPin(next);
    if (next.length === 6) window.setTimeout(() => void submitPin(next), 120);
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    setDashboard(null);
    setSelectedProfile(null);
    setPin("");
    await loadProfiles();
  }

  async function installApp() {
    if (!installPrompt) return;
    await installPrompt.prompt();
    await installPrompt.userChoice;
    setInstallPrompt(null);
  }

  if (screen === "loading") return <LoadingScreen />;

  if (screen === "profiles") {
    return (
      <main className="auth-shell">
        <BrandMark />
        <section className="auth-card profile-card">
          <div className="eyebrow"><ShieldCheck size={16} /> مساحة عائلية خاصة</div>
          <h1>أهلًا، من أنت؟</h1>
          <p className="muted">اختر بطاقتك للدخول إلى حسابك.</p>
          {error && <Alert message={error} />}
          <div className="profile-grid">
            {profiles.map((profile) => (
              <button
                className="profile-button"
                key={profile.id}
                onClick={() => {
                  setSelectedProfile(profile);
                  setPin("");
                  setError("");
                  setScreen("pin");
                }}
              >
                <span className="profile-avatar" style={{ background: profile.color }}>{profile.initials}</span>
                <span>{profile.name}</span>
                <ChevronLeft size={18} aria-hidden="true" />
              </button>
            ))}
          </div>
          {demo && <div className="demo-note">نسخة العرض: رمز الدخول <bdi>123456</bdi></div>}
        </section>
        <p className="auth-footnote">بياناتك محمية ولا تُحفظ على هذا الجهاز.</p>
      </main>
    );
  }

  if (screen === "pin" && selectedProfile) {
    return (
      <main className="auth-shell pin-shell">
        <button className="back-button" onClick={() => setScreen("profiles")} aria-label="العودة لاختيار العضو">
          <ArrowLeft size={20} /> تغيير العضو
        </button>
        <section className="auth-card pin-card">
          <span className="profile-avatar pin-avatar" style={{ background: selectedProfile.color }}>{selectedProfile.initials}</span>
          <h1>مرحبًا {selectedProfile.name}</h1>
          <p className="muted">أدخل رمزك المكوّن من 6 أرقام</p>
          <div className="pin-dots" aria-label={`${pin.length} أرقام مدخلة`}>
            {Array.from({ length: 6 }, (_, index) => <span className={index < pin.length ? "filled" : ""} key={index} />)}
          </div>
          {error && <Alert message={error} />}
          <NumericPad mode="pin" onKey={pressPin} disabled={busy} />
          {busy && <p className="checking">جارٍ التحقق…</p>}
        </section>
      </main>
    );
  }

  if (!dashboard) return <LoadingScreen />;

  const owed = dashboard.balance < 0 ? Math.abs(dashboard.balance) : 0;
  const credit = dashboard.balance > 0 ? dashboard.balance : 0;

  if (screen === "notifications") return <NotificationsPage onBack={() => { setScreen("dashboard"); void loadDashboard(true); }} />;
  if (screen === "admin" && dashboard.member.canManage) return <AdminDashboard onBack={() => { setScreen("dashboard"); void loadDashboard(true); }} />;

  if (screen === "loans") {
    return (
      <>
        <LoansPage
          dashboard={dashboard}
          onBack={() => setScreen("dashboard")}
          onPayment={() => setSheet("loanPayment")}
          onExpense={() => setSheet("expense")}
          onLogout={() => void logout()}
          onRefresh={() => void loadDashboard()}
          refreshing={busy}
        />
        {sheet && (
          <TransactionSheet
            kind={sheet}
            dashboard={dashboard}
            onClose={() => setSheet(null)}
            onSaved={(updated, warning, transaction) => {
              if (updated) setDashboard(updated);
              else if (transaction) setDashboard((current) => current ? { ...current, recent: [transaction, ...current.recent.filter((item) => `${item.type}-${item.id}` !== `${transaction.type}-${transaction.id}`)] } : current);
              else void loadDashboard(true);
              if (warning) setError(warning);
              setSheet(null);
            }}
          />
        )}
      </>
    );
  }

  return (
    <main className="app-shell">
      {offline && <div className="offline-banner"><WifiOff size={15} /> لا يوجد اتصال — التصفح فقط</div>}
      <header className="app-header">
        <div>
          <div className="mini-brand"><span>م</span> موازنة</div>
          <p>مساء الخير، {dashboard.member.name}</p>
        </div>
        <div className="header-actions">
          {dashboard.member.canManage && <button className="icon-button admin-button" onClick={() => setScreen("admin")} aria-label="لوحة المدير"><LayoutDashboard size={20} /></button>}
          <button className="icon-button notification-button" onClick={() => setScreen("notifications")} aria-label="الإشعارات"><Bell size={20} />{dashboard.unreadNotifications > 0 && <span>{Math.min(9, dashboard.unreadNotifications)}</span>}</button>
          {installPrompt && <button className="icon-button install-button" onClick={installApp} aria-label="تثبيت التطبيق"><Download size={20} /></button>}
          <button className="icon-button" onClick={() => void loadDashboard()} disabled={busy} aria-label="تحديث البيانات">
            <RefreshCw size={20} className={busy ? "spin" : ""} />
          </button>
          <button className="member-chip" onClick={logout} aria-label="تسجيل الخروج">
            <span style={{ background: dashboard.member.color }}>{dashboard.member.initials}</span>
            <LogOut size={17} />
          </button>
        </div>
      </header>

      {demo && <div className="demo-ribbon">وضع العرض — بيانات تجريبية</div>}
      {error && <Alert message={error} onClose={() => setError("")} />}

      <section className={`balance-card ${dashboard.obligations.monthlyRequired > 0 ? "balance-negative" : "balance-positive"}`}>
        <div className="balance-glow" />
        <div className="balance-top">
          <span>ملخص الديون</span>
          <span className="privacy-pill"><ShieldCheck size={14} /> معتمد فقط</span>
        </div>
        <p className="balance-kicker">إجمالي المطلوب هذا الشهر</p>
        <h1><Money value={dashboard.obligations.monthlyRequired} /></h1>
        <div className="balance-bottom">
          <div><span>الديون القصيرة المطلوبة</span><strong><Money value={owed} /></strong></div>
          <div><span>الأقساط المستحقة هذا الشهر</span><strong><Money value={dashboard.obligations.monthlyInstallments} /></strong></div>
        </div>
      </section>

      <section className="quick-actions" aria-label="إجراءات سريعة">
        <button className="quick-action expense-action" onClick={() => setSheet("expense")}>
          <span><Plus size={24} /></span>
          <div><strong>سجّل سحبًا</strong><small>في ثوانٍ</small></div>
          <ChevronLeft size={20} />
        </button>
        <button className="quick-action payment-action" onClick={() => setSheet("payment")}>
          <span><HandCoins size={24} /></span>
          <div><strong>سجّل إيداعًا</strong><small>للدين القصير</small></div>
          <ChevronLeft size={20} />
        </button>
      </section>

      <section className="section-block">
        <div className="section-title"><div><span>نظرة سريعة</span><h2>تفاصيل حسابك</h2></div></div>
        <div className="obligation-grid">
          <ObligationCard icon={WalletCards} title="الدين القصير" value={dashboard.obligations.debt} subtitle="السحوبات والمخالفات مقابل الإيداعات" tone="coral" />
          <ObligationCard icon={HandCoins} title="الرصيد المتاح" value={credit} subtitle="يمكن طلب سحبه كسحب جديد" tone="green" featured />
        </div>
        <div className="activity-summary" aria-label="ملخص الحركة"><div><span>السحوبات</span><strong><Money value={dashboard.totals.expenses} /></strong></div><div><span>السداد</span><strong><Money value={dashboard.totals.payments} /></strong></div><div><span>المكافآت</span><strong><Money value={dashboard.totals.rewards} /></strong></div><div><span>المخالفات</span><strong><Money value={dashboard.totals.penalties} /></strong></div></div>
      </section>

      <section className="section-block transactions-section">
        <div className="section-title"><div><span>آخر التحديثات</span><h2>العمليات الأخيرة</h2></div></div>
        <div className="transaction-tabs" role="tablist" aria-label="حالة العمليات">{([{ value: "approved", label: "معتمد" }, { value: "pending", label: "بانتظار المراجعة" }, { value: "rejected", label: "مرفوض" }] as const).map((tab) => <button role="tab" aria-selected={transactionTab === tab.value} className={transactionTab === tab.value ? "active" : ""} key={tab.value} onClick={() => { setTransactionTab(tab.value); setTransactionPage(1); }}>{tab.label}</button>)}</div>
        <div className="transaction-list">
          {transactionsBusy ? <div className="empty-state"><RefreshCw size={21} className="spin" /><span>جارٍ تحميل العمليات…</span></div> : transactionData.transactions.length ? transactionData.transactions.map((item) => <TransactionRow item={item} key={`${item.type}-${item.id}`} />) : <EmptyState text="لا توجد عمليات في هذه الحالة" />}
        </div>
        {transactionData.totalPages > 1 && (
          <nav className="transaction-pagination" aria-label="صفحات العمليات">
            {Array.from({ length: transactionData.totalPages }, (_, index) => index + 1).map((page) => (
              <button key={page} className={page === transactionData.page ? "active" : ""} onClick={() => setTransactionPage(page)} aria-label={`الصفحة ${page}`} aria-current={page === transactionData.page ? "page" : undefined}>{page}</button>
            ))}
          </nav>
        )}
      </section>

      <nav className="bottom-nav" aria-label="التنقل الرئيسي">
        <button className="active"><WalletCards size={21} /><span>الرئيسية</span></button>
        <button onClick={() => setScreen("loans")}><ListTree size={21} /><span>الأقساط</span></button>
        <button onClick={() => setSheet("expense")}><Plus size={22} /><span>سحب</span></button>
        <button onClick={() => setSheet("payment")}><HandCoins size={21} /><span>إيداع</span></button>
      </nav>

      {sheet && (
        <TransactionSheet
          kind={sheet}
          dashboard={dashboard}
          onClose={() => setSheet(null)}
          onSaved={(updated, warning, transaction) => {
            if (updated) setDashboard(updated);
            else if (transaction) setDashboard((current) => current ? { ...current, recent: [transaction, ...current.recent.filter((item) => `${item.type}-${item.id}` !== `${transaction.type}-${transaction.id}`)] } : current);
            else void loadDashboard(true);
            if (warning) setError(warning);
            setSheet(null);
          }}
        />
      )}
    </main>
  );
}

function LoansPage({
  dashboard,
  onBack,
  onPayment,
  onExpense,
  onLogout,
  onRefresh,
  refreshing,
}: {
  dashboard: DashboardData;
  onBack: () => void;
  onPayment: () => void;
  onExpense: () => void;
  onLogout: () => void;
  onRefresh: () => void;
  refreshing: boolean;
}) {
  const [expandedLoanId, setExpandedLoanId] = useState<number | null>(null);
  const activeLoans = dashboard.loans.filter((loan) => loan.remainingAmount > 0 || loan.nextInstallment);
  const totalDebt = activeLoans.reduce((sum, loan) => sum + loan.totalAmount, 0);
  const remainingDebt = activeLoans.reduce((sum, loan) => sum + loan.remainingAmount, 0);
  const paidDebt = Math.max(0, totalDebt - remainingDebt);
  const openInstallments = dashboard.installments.filter((installment) => !["paid", "cancelled", "carried_forward"].includes(installment.status));
  const monthlyDue = dashboard.obligations.monthlyInstallments;
  const earliestDue = [...openInstallments].sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];

  return (
    <main className="app-shell loans-page">
      <header className="app-header loans-header">
        <button className="back-button page-back" onClick={onBack}><ArrowLeft size={20} /> الرئيسية</button>
        <div className="header-actions">
          <button className="icon-button" onClick={onRefresh} disabled={refreshing} aria-label="تحديث البيانات"><RefreshCw size={20} className={refreshing ? "spin" : ""} /></button>
          <button className="member-chip" onClick={onLogout} aria-label="تسجيل الخروج"><span style={{ background: dashboard.member.color }}>{dashboard.member.initials}</span><LogOut size={17} /></button>
        </div>
      </header>

      <section className="loans-hero">
        <div className="eyebrow"><ListTree size={16} /> ملف الديون</div>
        <h1>الديون الطويلة والأقساط</h1>
        <p>التزاماتك طويلة الأجل، وكل قسط مرتبط بدينه بوضوح.</p>
        <div className="loan-summary-grid">
          <div><span>إجمالي الديون</span><strong><Money value={totalDebt} /></strong></div>
          <div><span>المدفوع</span><strong><Money value={paidDebt} /></strong></div>
          <div><span>المتبقي</span><strong><Money value={remainingDebt} /></strong></div>
        </div>
        <div className="loan-summary-foot"><span>المستحق في الأقساط القادمة</span><strong><Money value={monthlyDue} /></strong>{earliestDue && <small>أقرب موعد {prettyDate(earliestDue.dueDate)}</small>}</div>
      </section>

      <section className="section-block loan-list-section">
        <div className="section-title"><div><span>{activeLoans.length} ديون نشطة</span><h2>كل دين على حدة</h2></div></div>
        {activeLoans.length ? activeLoans.map((loan) => {
          const installments = dashboard.installments
            .filter((installment) => installment.loanId === loan.id)
            .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
          const next = installments.find((installment) => !["paid", "cancelled"].includes(installment.status));
          const paid = Math.max(0, loan.totalAmount - loan.remainingAmount);
          const progress = loan.totalAmount ? Math.min(100, (paid / loan.totalAmount) * 100) : 0;
          const expanded = expandedLoanId === loan.id;
          return (
            <article className="loan-detail-card" key={loan.id}>
              <div className="loan-detail-head"><div><span>دين مستقل</span><h3>{loan.title}</h3></div><StatusBadge status={loan.status} /></div>
              <div className="loan-amounts"><div><span>المدفوع</span><strong><Money value={paid} /></strong></div><div><span>المتبقي</span><strong><Money value={loan.remainingAmount} /></strong></div></div>
              <div className="progress-track loan-progress"><span style={{ width: `${progress}%` }} /></div>
              <small className="loan-total">إجمالي الدين <Money value={loan.totalAmount} /></small>
              {next ? <div className="loan-next"><div><span>القسط القادم</span><strong><Money value={next.remainingAmount} /></strong><small>{prettyDate(next.dueDate)}</small></div><button onClick={onPayment}><HandCoins size={18} /> سداد</button></div> : <div className="loan-settled"><Check size={17} /> لا توجد أقساط مفتوحة لهذا الدين</div>}
              {!!loan.pendingPaymentAmount && <small className="loan-pending">سداد قيد المراجعة: <Money value={loan.pendingPaymentAmount} /> — لا يدخل في المدفوع حتى يعتمد</small>}
              <button className="installments-toggle" onClick={() => setExpandedLoanId(expanded ? null : loan.id)} aria-expanded={expanded}><span>{expanded ? "إخفاء الأقساط" : `عرض الأقساط (${installments.length})`}</span><ChevronLeft size={18} className={expanded ? "rotate" : ""} /></button>
              {expanded && <div className="installment-history">
                {installments.length ? installments.map((installment) => <div className="installment-history-row" key={installment.id}><div><strong>{installment.title}</strong><span>{prettyDate(installment.dueDate)}</span></div><div><strong><Money value={installment.remainingAmount} /></strong><StatusBadge status={installment.status} /></div></div>) : <EmptyState text="لا توجد أقساط مسجلة لهذا الدين" />}
              </div>}
            </article>
          );
        }) : <EmptyState text="لا توجد ديون نشطة الآن" />}
      </section>

      <nav className="bottom-nav" aria-label="التنقل الرئيسي">
        <button onClick={onBack}><WalletCards size={21} /><span>الرئيسية</span></button>
        <button className="active"><ListTree size={21} /><span>الأقساط</span></button>
        <button onClick={onExpense}><Plus size={22} /><span>سحب</span></button>
        <button onClick={onPayment}><HandCoins size={21} /><span>سداد قسط</span></button>
      </nav>
    </main>
  );
}

function BrandMark() {
  return <div className="brand-mark"><span>م</span><strong>موازنة</strong><small>حسابك العائلي ببساطة</small></div>;
}

function LoadingScreen() {
  return <main className="loading-screen"><BrandMark /><div className="loading-dots"><span /><span /><span /></div></main>;
}

function Alert({ message, onClose }: { message: string; onClose?: () => void }) {
  return <div className="alert" role="alert"><TriangleAlert size={17} /><span>{message}</span>{onClose && <button onClick={onClose} aria-label="إغلاق"><X size={16} /></button>}</div>;
}

function NumericPad({ mode, onKey, disabled }: { mode: "pin" | "amount"; onKey: (key: string) => void; disabled?: boolean }) {
  const keys = mode === "pin" ? ["1", "2", "3", "4", "5", "6", "7", "8", "9", "empty", "0", "back"] : ["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "back"];
  return (
    <div className={`numeric-pad ${mode}`} dir="ltr">
      {keys.map((key, index) => key === "empty" ? <span key={`empty-${index}`} /> : (
        <button key={key} onClick={() => onKey(key)} disabled={disabled} aria-label={key === "back" ? "حذف" : key === "." ? "فاصلة عشرية" : key}>
          {key === "back" ? <Backspace size={24} /> : key}
        </button>
      ))}
    </div>
  );
}

function ObligationCard({ icon: Icon, title, value, subtitle, tone, featured = false }: { icon: typeof WalletCards; title: string; value: number; subtitle: string; tone: string; featured?: boolean }) {
  return <article className={`obligation-card ${tone} ${featured ? "featured" : ""}`}><span className="metric-icon"><Icon size={22} /></span><p>{title}</p><strong><Money value={value} /></strong><small>{subtitle}</small></article>;
}

function TransactionRow({ item }: { item: FinancialTransaction }) {
  const meta = transactionMeta(item.type);
  const positive = item.type === "payment" || item.type === "reward" || item.type === "loan_payment";
  return (
    <article className="transaction-row">
      <span className={`transaction-icon ${meta.tone}`}>{meta.icon}</span>
      <div className="transaction-copy"><strong>{transactionTitle(item, meta.label)}</strong><span>{prettyDateTime(item.date)}{item.note ? ` · ${item.note}` : ""}</span>{item.imageUrl && <a className="transaction-image-link" href={item.imageUrl} target="_blank" rel="noreferrer">عرض الصورة</a>}{item.type === "penalty" && item.canObject && <PenaltyObjectionButton transaction={item} />}{item.type === "penalty" && item.objectionStatus === "pending" && <small className="objection-status">اعتراضك بانتظار مراجعة المدير</small>}{item.type === "penalty" && item.objectionStatus === "accepted" && <small className="objection-status accepted">تم قبول الاعتراض</small>}{item.type === "penalty" && item.objectionStatus === "rejected" && <small className="objection-status rejected">تم رفض الاعتراض</small>}</div>
      <div className="transaction-value"><strong className={positive ? "positive" : "negative"}><Money value={item.amount} sign={positive ? "+" : "−"} /></strong><StatusBadge status={item.status} /></div>
    </article>
  );
}

function transactionTitle(item: FinancialTransaction, fallback: string): string {
  if (item.type === "payment" && ["سداد عام", "إيداع"].includes(item.title)) return "إيداع عام";
  if (item.type === "loan_payment" && item.title === "سداد قسط") return "إيداع قسط";
  if (item.type === "penalty") return `مخالفة - ${item.title || fallback}`;
  return item.title || fallback;
}

function PenaltyObjectionButton({ transaction }: { transaction: FinancialTransaction }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit() {
    if (text.trim().length < 2) return setError("اكتب سبب الاعتراض.");
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/me/penalties/${transaction.id}/objection`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? "تعذر إرسال الاعتراض.");
      setOpen(false); setText(""); window.location.reload();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "تعذر إرسال الاعتراض."); }
    finally { setBusy(false); }
  }
  return <><button className="objection-button" onClick={() => setOpen(true)} aria-label="تقديم اعتراض على المخالفة"><MessageCircleWarning size={14} /> اعتراض</button>{open && <div className="objection-inline"><textarea value={text} onChange={(event) => setText(event.target.value)} placeholder="اكتب سبب اعتراضك" maxLength={1000} />{error && <small>{error}</small>}<div><button onClick={() => void submit()} disabled={busy}>{busy ? "جارٍ الإرسال…" : "إرسال الاعتراض"}</button><button onClick={() => setOpen(false)} disabled={busy}>إلغاء</button></div></div>}</>;
}

function StatusBadge({ status }: { status: CanonicalStatus }) {
  return <span className={`status-badge status-${status}`}>{statusLabel(status)}</span>;
}

function EmptyState({ text }: { text: string }) {
  return <div className="empty-state"><Check size={22} /><span>{text}</span></div>;
}

function transactionMeta(type: FinancialTransaction["type"]) {
  if (type === "payment") return { label: "إيداع عام", icon: <HandCoins size={19} />, tone: "blue" };
  if (type === "loan_payment") return { label: "إيداع قسط", icon: <CalendarClock size={19} />, tone: "green" };
  if (type === "reward") return { label: "مكافأة", icon: <Gift size={19} />, tone: "violet" };
  if (type === "penalty") return { label: "مخالفة", icon: <TriangleAlert size={19} />, tone: "amber" };
  return { label: "سحب", icon: <WalletCards size={19} />, tone: "coral" };
}

function TransactionSheet({
  kind,
  dashboard,
  onClose,
  onSaved,
}: {
  kind: Exclude<SheetKind, null>;
  dashboard: DashboardData;
  onClose: () => void;
  onSaved: (dashboard?: DashboardData, warning?: string, transaction?: FinancialTransaction) => void;
}) {
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("بنزين");
  const [store, setStore] = useState("");
  const [note, setNote] = useState("");
  const [date, setDate] = useState(todayInRiyadh());
  const installmentOnly = kind === "loanPayment";
  const [targetType] = useState<"general" | "installment">(installmentOnly ? "installment" : "general");
  const payableInstallments = dashboard.installments.filter((item) => !["paid", "cancelled", "carried_forward"].includes(item.status) && !item.hasPendingPayment && dashboard.loans.find((loan) => loan.id === item.loanId)?.status === "active");
  const [installmentId, setInstallmentId] = useState<number | undefined>(payableInstallments[0]?.id);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const numericAmount = Number(amount || 0);

  const selectedInstallment = useMemo(
    () => dashboard.installments.find((item) => item.id === installmentId),
    [dashboard.installments, installmentId],
  );

  function pressAmount(key: string) {
    setError("");
    if (key === "back") return setAmount((value) => value.slice(0, -1));
    setAmount((value) => {
      if (key === ".") return value.includes(".") ? value : value ? `${value}.` : "0.";
      const decimals = value.split(".")[1];
      if (decimals?.length >= 2 || value.replace(".", "").length >= 8) return value;
      return value === "0" ? key : `${value}${key}`;
    });
  }

  async function submit() {
    if (!numericAmount || numericAmount <= 0) return setError("أدخل مبلغًا صحيحًا أولًا.");
    if ((kind === "payment" || kind === "loanPayment") && targetType === "installment" && !installmentId) return setError("اختر القسط المطلوب.");
    setBusy(true);
    setError("");
    try {
      const endpoint = kind === "expense" ? "/api/me/expenses" : "/api/me/payments";
      const body = kind === "expense"
        ? { amount: numericAmount, category, store, note, date, requestId: crypto.randomUUID() }
        : { amount: numericAmount, targetType, installmentId: targetType === "installment" ? installmentId : undefined, note, date, requestId: crypto.randomUUID() };
      const result = await readJson<{ dashboard?: DashboardData; transaction?: FinancialTransaction }>(
        await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
      );
      if (navigator.vibrate) navigator.vibrate([40, 30, 70]);
      onSaved(result.dashboard, undefined, result.transaction);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر الحفظ.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="sheet-layer" role="dialog" aria-modal="true" aria-label={kind === "expense" ? "تسجيل سحب" : installmentOnly ? "تسجيل سداد قسط" : "تسجيل إيداع"}>
      <button className="sheet-backdrop" onClick={onClose} aria-label="إغلاق" />
      <section className="transaction-sheet">
        <div className="sheet-handle" />
        <header><div><span>{kind === "expense" ? "عملية جديدة" : "إثبات دفعة"}</span><h2>{kind === "expense" ? "سجّل سحبًا" : installmentOnly ? "سجّل سداد قسط" : "سجّل إيداعًا"}</h2></div><button onClick={onClose} aria-label="إغلاق"><X size={22} /></button></header>
        <div className="amount-display"><span>المبلغ</span><strong><Money value={numericAmount} /></strong></div>
        <NumericPad mode="amount" onKey={pressAmount} disabled={busy} />

        {kind === "expense" ? (
          <div className="form-section">
            <label className="field-label">التصنيف</label>
            <div className="category-grid">
              {categories.map(({ label, icon: Icon }) => (
                <button className={category === label ? "selected" : ""} key={label} onClick={() => setCategory(label)}><Icon size={18} />{label}</button>
              ))}
            </div>
            <div className="input-grid">
              <label><span>المتجر <em>اختياري</em></span><input value={store} onChange={(event) => setStore(event.target.value)} maxLength={80} placeholder="مثال: محطة ساسكو" /></label>
              <label><span>ملاحظة <em>اختياري</em></span><input value={note} onChange={(event) => setNote(event.target.value)} maxLength={240} placeholder="أي تفاصيل إضافية" /></label>
            </div>
          </div>
        ) : (
          <div className="form-section">
            {!installmentOnly && <><label className="field-label">وجهة الإيداع</label><div className="target-switch"><button className="selected"><HandCoins size={19} />إيداع عام</button></div></>}
            {installmentOnly && <label className="field-label">القسط المطلوب سداده</label>}
            {targetType === "installment" && (
              <label><span>اختر القسط</span><select value={installmentId} onChange={(event) => setInstallmentId(Number(event.target.value))}>{payableInstallments.map((item) => <option value={item.id} key={item.id}>{item.title} — {money(item.remainingAmount)} ﷼</option>)}</select>{selectedInstallment && <small className="field-hint">متبقي <Money value={selectedInstallment.remainingAmount} /> · {prettyDate(selectedInstallment.dueDate)}</small>}</label>
            )}
            <label><span>ملاحظة <em>اختياري</em></span><input value={note} onChange={(event) => setNote(event.target.value)} maxLength={240} placeholder="مثال: حوالة بنكية" /></label>
          </div>
        )}

        <label className="date-field"><span>التاريخ</span><input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>
        {error && <Alert message={error} />}
        <button className="submit-transaction" onClick={submit} disabled={busy || !numericAmount}>
          {busy ? "جارٍ الحفظ…" : <><Check size={21} /> تأكيد وإرسال للمراجعة</>}
        </button>
        <p className="pending-note"><ShieldCheck size={14} /> لن يؤثر المبلغ في الرصيد قبل اعتماده.</p>
      </section>
    </div>
  );
}
