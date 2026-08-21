"use client";

import Image from "next/image";
import {
  ArrowLeft, Bell, Check, CirclePause, FilePenLine, HandCoins, Landmark, ListChecks,
  Gift, Plus, RefreshCw, ShieldCheck, TriangleAlert, WalletCards, X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { calculateLoanTerms } from "@/lib/finance";
import { transactionDisplayStatus } from "@/lib/finance";
import type { AdminDashboardData, CanonicalStatus, FinancialTransaction, NotificationItem } from "@/lib/types";

const moneyFormatter = new Intl.NumberFormat("ar-SA", { maximumFractionDigits: 2 });
const dateFormatter = new Intl.DateTimeFormat("ar-SA-u-ca-gregory", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Asia/Riyadh" });

function Money({ value }: { value: number }) {
  return <span className="money" dir="ltr"><Image src="/assets/saudi-riyal.svg" alt="ريال" width={12} height={14} /><bdi>{moneyFormatter.format(value)}</bdi></span>;
}

async function jsonRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error ?? "حدث خطأ غير متوقع.");
  return payload as T;
}

export function AdminDashboard({ onBack }: { onBack: () => void }) {
  const [data, setData] = useState<AdminDashboardData | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [type, setType] = useState("");
  const [memberId, setMemberId] = useState("");
  const [page, setPage] = useState(1);
  const [composer, setComposer] = useState<"transaction" | "loan">("transaction");
  const [selected, setSelected] = useState<FinancialTransaction | null>(null);

  const load = useCallback(async () => {
    setBusy(true); setError("");
    const query = new URLSearchParams({ page: String(page), perPage: "8" });
    if (status) query.set("status", status);
    if (type) query.set("type", type);
    if (memberId) query.set("memberId", memberId);
    try { setData(await jsonRequest<AdminDashboardData>(`/api/admin/dashboard?${query}`)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "تعذر تحميل لوحة الإدارة."); }
    finally { setBusy(false); }
  }, [memberId, page, status, type]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  function changeFilter(setter: (value: string) => void, value: string) { setter(value); setPage(1); }
  async function markManagerNotificationsRead() {
    await fetch("/api/me/notifications?audience=manager", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ all: true }) });
    await load();
  }

  return (
    <main className="admin-shell">
      <header className="admin-header">
        <div><button className="back-button" onClick={onBack}><ArrowLeft size={20} /> حسابي</button><div className="admin-brand"><span><ShieldCheck size={20} /></span><div><strong>إدارة موازنة</strong><small>مركز القرارات المالية</small></div></div></div>
        <div className="header-actions"><button className="icon-button" onClick={() => void load()} aria-label="تحديث"><RefreshCw size={20} className={busy ? "spin" : ""} /></button></div>
      </header>
      {data?.demo && <div className="demo-ribbon">وضع العرض — لوحة المدير تجريبية</div>}
      {error && <div className="alert" role="alert"><TriangleAlert size={17} />{error}</div>}

      <section className="admin-hero"><div><span>نظرة الإدارة</span><h1>كل ما يحتاج قرارك</h1><p>اعتمد العمليات، تابع الأقساط، وأنشئ التزامات الأعضاء من شاشة واحدة.</p></div><div className="admin-hero-badge"><Bell size={20} /><strong>{data?.unreadNotifications ?? 0}</strong><span>تنبيه جديد</span></div></section>

      <section className="admin-metrics">
        <AdminMetric icon={ListChecks} label="بانتظار القرار" value={data?.metrics.pending ?? 0} tone="amber" />
        <AdminMetric icon={CirclePause} label="معلّقة" value={data?.metrics.onHold ?? 0} tone="blue" />
        <AdminMetric icon={TriangleAlert} label="أقساط متأخرة" value={data?.metrics.overdueInstallments ?? 0} tone="coral" />
        <AdminMetric icon={Landmark} label="قروض نشطة" value={data?.metrics.activeLoans ?? 0} tone="green" />
      </section>

      {data && <section className="admin-composer panel">
        <div className="panel-heading"><div><span>إضافة بالنيابة</span><h2>عملية أو قرض جديد</h2></div><div className="segmented"><button className={composer === "transaction" ? "active" : ""} onClick={() => setComposer("transaction")}>عملية</button><button className={composer === "loan" ? "active" : ""} onClick={() => setComposer("loan")}>قرض مقسّط</button></div></div>
        {composer === "transaction" ? <AdminTransactionForm data={data} onSaved={load} /> : <AdminLoanForm data={data} onSaved={load} />}
      </section>}

      <div className="admin-grid">
        <section className="panel admin-queue">
          <div className="panel-heading"><div><span>طابور المراجعة</span><h2>كل العمليات</h2></div></div>
          <div className="admin-filters">
            <select aria-label="الحالة" value={status} onChange={(event) => changeFilter(setStatus, event.target.value)}><option value="">كل الحالات</option><option value="pending">بانتظار</option><option value="on_hold">معلّقة</option><option value="approved">معتمدة</option><option value="rejected">مرفوضة</option></select>
            <select aria-label="النوع" value={type} onChange={(event) => changeFilter(setType, event.target.value)}><option value="">كل الأنواع</option><option value="expense">سحب</option><option value="payment">إيداع عام</option><option value="loan_payment">إيداع قسط</option><option value="reward">مكافأة</option><option value="penalty">مخالفة</option></select>
            <select aria-label="العضو" value={memberId} onChange={(event) => changeFilter(setMemberId, event.target.value)}><option value="">كل الأعضاء</option>{data?.profiles.map((profile) => <option value={profile.id} key={profile.id}>{profile.name}</option>)}</select>
          </div>
          <div className="admin-transaction-list">
            {!busy && !data?.transactions.transactions.length && <div className="empty-state"><Check size={22} /><span>لا توجد عمليات مطابقة</span></div>}
            {data?.transactions.transactions.map((item) => { const visibleStatus = transactionDisplayStatus(item); return <button className="admin-transaction" key={`${item.type}-${item.id}`} onClick={() => setSelected(item)}><span className={`admin-type type-${item.type}`}>{item.type === "expense" ? <WalletCards size={18} /> : item.type === "reward" ? <Gift size={18} /> : item.type === "penalty" ? <TriangleAlert size={18} /> : <HandCoins size={18} />}</span><div><strong>{item.type === "penalty" ? `مخالفة - ${item.title}` : item.title}</strong><span>{item.memberName} · {dateFormatter.format(new Date(item.date))}</span></div><div><strong><Money value={item.amount} /></strong><span className={`status-badge status-${visibleStatus}`}>{adminStatus(visibleStatus)}</span>{item.objectionStatus === "pending" && <small className="objection-status">اعتراض بانتظار القرار</small>}</div><span className="admin-transaction-details">التفاصيل</span></button>; })}
          </div>
          {(data?.transactions.totalPages ?? 1) > 1 && <nav className="transaction-pagination">{Array.from({ length: data?.transactions.totalPages ?? 1 }, (_, index) => index + 1).map((value) => <button className={page === value ? "active" : ""} key={value} onClick={() => setPage(value)}>{value}</button>)}</nav>}
        </section>

        <section className="panel admin-notifications">
          <div className="panel-heading"><div><span>{data?.unreadNotifications ?? 0} غير مقروء</span><h2>إشعارات المدير</h2></div>{Boolean(data?.unreadNotifications) ? <button className="text-button" onClick={() => void markManagerNotificationsRead()}><Check size={16} /> تعليم كمقروء</button> : <Bell size={21} />}</div>
          <div className="admin-notification-list">{data?.notifications.slice(0, 12).map((item) => { const transaction = adminPenaltyNotificationTransaction(item); return <article className={item.readAt ? "" : "unread"} key={item.id}><span /><div><strong>{item.title}</strong><p>{item.body}</p><time>{dateFormatter.format(new Date(item.createdAt))}</time>{transaction && <button className="notification-details-button" onClick={() => setSelected(transaction)}>اضغط للتفاصيل</button>}</div></article>; })}{!data?.notifications.length && <div className="empty-state"><Check size={22} /><span>لا توجد تنبيهات</span></div>}</div>
        </section>
      </div>

      {selected && <AdminDecisionSheet transaction={selected} onClose={() => setSelected(null)} onSaved={() => { setSelected(null); void load(); }} />}
    </main>
  );
}

function AdminMetric({ icon: Icon, label, value, tone }: { icon: typeof ListChecks; label: string; value: number; tone: string }) {
  return <article className={`admin-metric ${tone}`}><span><Icon size={21} /></span><div><strong>{value}</strong><small>{label}</small></div></article>;
}

function adminPenaltyNotificationTransaction(item: NotificationItem): FinancialTransaction | null {
  if (item.payload?.transaction?.type === "penalty") return item.payload.transaction;
  const isPenalty = item.entityType === "penalty" || /مخالفة/.test(`${item.title} ${item.body}`);
  if (!isPenalty || !item.entityId) return null;
  const titleMatch = `${item.title} ${item.body}`.match(/مخالفة\s*-\s*([^.|،]+)/);
  return { id: item.entityId, type: "penalty", title: titleMatch?.[1]?.trim() || "مخالفة", amount: 0, date: item.createdAt, status: "approved", note: item.body, objectionStatus: "none" };
}

function AdminTransactionForm({ data, onSaved }: { data: AdminDashboardData; onSaved: () => void }) {
  const [memberId, setMemberId] = useState(data.profiles[0]?.id ?? 0);
  const [type, setType] = useState<"expense" | "payment" | "loan_payment" | "reward" | "penalty">("expense");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("سحب إداري");
  const [installmentId, setInstallmentId] = useState<number | undefined>();
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState("");
  const [imageData, setImageData] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const installments = data.installments.filter((item) => item.memberId === memberId && !item.hasPendingPayment);

  const effectiveInstallmentId = installmentId ?? installments[0]?.id;

  async function submit(event: React.FormEvent) {
    event.preventDefault(); setMessage("");
    if (!window.confirm("ستُحفظ العملية معتمدة مباشرة وتؤثر ماليًا. هل تريد المتابعة؟")) return;
    setBusy(true);
    if (needsDetails && ["مخالفة", "مكافأة"].includes(category.trim())) { setMessage("أدخل عنوانًا واضحًا للمخالفة أو المكافأة."); setBusy(false); return; }
    try {
      await jsonRequest("/api/admin/transactions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ memberId, type, amount: Number(amount), category, installmentId: type === "loan_payment" ? effectiveInstallmentId : undefined, date, note, imageData: imageData || undefined, requestId: crypto.randomUUID() }) });
      setAmount(""); setNote(""); setImageData(""); setMessage("تم حفظ العملية واعتمادها وإرسال إشعار للعضو."); onSaved();
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : "تعذر الحفظ."); }
    finally { setBusy(false); }
  }

  const needsDetails = type === "reward" || type === "penalty";
  function readImage(file?: File) { if (!file) return; if (!file.type.startsWith("image/")) return setMessage("اختر ملف صورة فقط."); if (file.size > 2_500_000) return setMessage("حجم الصورة يجب ألا يتجاوز 2.5 م.ب."); const reader = new FileReader(); reader.onload = () => setImageData(String(reader.result)); reader.readAsDataURL(file); }
  return <form className="admin-form" onSubmit={submit}><label><span>العضو</span><select value={memberId} onChange={(event) => { setMemberId(Number(event.target.value)); setInstallmentId(undefined); }}>{data.profiles.map((profile) => <option value={profile.id} key={profile.id}>{profile.name}</option>)}</select></label><label><span>النوع</span><select value={type} onChange={(event) => { const next = event.target.value as typeof type; setType(next); setInstallmentId(undefined); if (next === "reward") setCategory("مكافأة"); if (next === "penalty") setCategory("مخالفة"); if (next === "expense") setCategory("سحب إداري"); }}><option value="expense">سحب</option><option value="payment">إيداع عام</option><option value="loan_payment">سداد قسط</option><option value="reward">مكافأة</option><option value="penalty">مخالفة</option></select></label><label><span>المبلغ</span><input required min="0.01" step="0.01" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} /></label>{(type === "expense" || needsDetails) && <label><span>العنوان</span><input required value={category} onChange={(event) => setCategory(event.target.value)} placeholder={needsDetails ? "عنوان المخالفة أو المكافأة" : undefined} /></label>}{type === "loan_payment" && <label><span>القسط</span><select required value={effectiveInstallmentId ?? ""} onChange={(event) => setInstallmentId(Number(event.target.value))}><option value="" disabled>اختر القسط</option>{installments.map((item) => <option value={item.id} key={item.id}>{item.title} — {moneyFormatter.format(item.remainingAmount)} ريال</option>)}</select></label>}<label><span>التاريخ</span><input required type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>{needsDetails && <label><span>الصورة <em>اختياري</em></span><input type="file" accept="image/*" onChange={(event) => readImage(event.target.files?.[0])} /><small className="field-hint">{imageData ? "تمت إضافة الصورة" : "حتى 2.5 م.ب."}</small></label>}<label className="wide"><span>الوصف <em>اختياري</em></span><input value={note} onChange={(event) => setNote(event.target.value)} /></label><div className="wide form-submit-row">{message && <small>{message}</small>}<button className="primary-button" disabled={busy || !amount || (type === "loan_payment" && !effectiveInstallmentId)}><Plus size={18} />{busy ? "جارٍ الحفظ…" : "حفظ واعتماد"}</button></div></form>;
}

function AdminLoanForm({ data, onSaved }: { data: AdminDashboardData; onSaved: () => void }) {
  const [memberId, setMemberId] = useState(data.profiles[0]?.id ?? 0);
  const [title, setTitle] = useState(""); const [principal, setPrincipal] = useState(""); const [rate, setRate] = useState("0"); const [count, setCount] = useState("12");
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10)); const [status, setStatus] = useState("active"); const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState("");
  const terms = useMemo(() => calculateLoanTerms(Number(principal || 0), Number(rate || 0), Number(count || 1)), [principal, rate, count]);
  async function submit(event: React.FormEvent) { event.preventDefault(); setBusy(true); setMessage(""); try { await jsonRequest("/api/admin/loans", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ memberId, title, principalAmount: Number(principal), interestRate: Number(rate), installmentCount: Number(count), startDate, status, notes, requestId: crypto.randomUUID() }) }); setMessage("تم إنشاء القرض وجدوله."); setTitle(""); setPrincipal(""); onSaved(); } catch (cause) { setMessage(cause instanceof Error ? cause.message : "تعذر إنشاء القرض."); } finally { setBusy(false); } }
  return <><form className="admin-form loan-form" onSubmit={submit}><label><span>العضو</span><select value={memberId} onChange={(event) => setMemberId(Number(event.target.value))}>{data.profiles.map((profile) => <option value={profile.id} key={profile.id}>{profile.name}</option>)}</select></label><label><span>اسم القرض</span><input required value={title} onChange={(event) => setTitle(event.target.value)} placeholder="مثال: الآيفون" /></label><label><span>أصل المبلغ</span><input required min="0.01" step="0.01" type="number" value={principal} onChange={(event) => setPrincipal(event.target.value)} /></label><label><span>الفائدة %</span><input required min="0" step="0.01" type="number" value={rate} onChange={(event) => setRate(event.target.value)} /></label><label><span>عدد الأقساط</span><input required min="1" max="240" type="number" value={count} onChange={(event) => setCount(event.target.value)} /></label><label><span>أول استحقاق</span><input required type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} /></label><label><span>الحالة</span><select value={status} onChange={(event) => setStatus(event.target.value)}><option value="active">نشط</option><option value="draft">مسودة</option><option value="suspended">معلّق</option><option value="cancelled">ملغي</option></select></label><label><span>ملاحظات</span><input value={notes} onChange={(event) => setNotes(event.target.value)} /></label><div className="wide form-submit-row">{message && <small>{message}</small>}<button className="primary-button" disabled={busy || !principal || !title}><Landmark size={18} />{busy ? "جارٍ الإنشاء…" : "إنشاء القرض"}</button></div></form><div className="loan-preview"><div><span>مبلغ الفائدة</span><strong><Money value={terms.interestAmount} /></strong></div><div><span>الإجمالي</span><strong><Money value={terms.totalAmount} /></strong></div><div><span>المتبقي</span><strong><Money value={terms.remainingAmount} /></strong></div><div><span>القسط التقريبي</span><strong><Money value={terms.installmentAmount} /></strong></div></div></>;
}

function AdminDecisionSheet({ transaction, onClose, onSaved }: { transaction: FinancialTransaction; onClose: () => void; onSaved: () => void }) {
  const [note, setNote] = useState(transaction.managerNote ?? ""); const [amount, setAmount] = useState(String(transaction.amount)); const [title, setTitle] = useState(transaction.title); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const editable = ["pending", "on_hold"].includes(transaction.status);
  const objectionPending = transaction.type === "penalty" && transaction.objectionStatus === "pending";
  async function act(action: "approve" | "hold" | "reject") { if ((action === "hold" || action === "reject") && note.trim().length < 2) return setError("اكتب ملاحظة قبل التعليق أو الرفض."); setBusy(true); setError(""); try { await jsonRequest(`/api/admin/transactions/${transaction.type}/${transaction.id}/${action}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ note }) }); onSaved(); } catch (cause) { setError(cause instanceof Error ? cause.message : "تعذر تنفيذ القرار."); } finally { setBusy(false); } }
  async function decideObjection(action: "accept" | "reject") { setBusy(true); setError(""); try { await jsonRequest(`/api/admin/penalties/${transaction.id}/objection/${action}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ note }) }); onSaved(); } catch (cause) { setError(cause instanceof Error ? cause.message : "تعذر اتخاذ قرار الاعتراض."); } finally { setBusy(false); } }
  async function saveEdit() { setBusy(true); setError(""); try { await jsonRequest(`/api/admin/transactions/${transaction.type}/${transaction.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ amount: Number(amount), title, note: transaction.note }) }); onSaved(); } catch (cause) { setError(cause instanceof Error ? cause.message : "تعذر التعديل."); } finally { setBusy(false); } }
  const visibleStatus = transactionDisplayStatus(transaction);
  return <div className="sheet-layer" role="dialog" aria-modal="true" aria-label="قرار العملية"><button className="sheet-backdrop" onClick={onClose} aria-label="إغلاق" /><section className="admin-decision-sheet"><header><div><span>{transaction.memberName}</span><h2>{transaction.title}</h2></div><button onClick={onClose} aria-label="إغلاق"><X size={21} /></button></header><div className="decision-amount"><Money value={transaction.amount} /><span className={`status-badge status-${visibleStatus}`}>{adminStatus(visibleStatus)}</span></div><div className="decision-details"><span>النوع: {transaction.type}</span><span>التاريخ: {dateFormatter.format(new Date(transaction.date))}</span>{transaction.note && <span>الوصف: {transaction.note}</span>}{transaction.imageUrl && <a href={transaction.imageUrl} target="_blank" rel="noreferrer">عرض الصورة المرفقة</a>}{transaction.type === "penalty" && transaction.objectionStatus && transaction.objectionStatus !== "none" && <><span>حالة الاعتراض: {transaction.objectionStatus === "pending" ? "بانتظار قرار المدير" : transaction.objectionStatus === "accepted" ? "مقبول" : transaction.objectionStatus === "rejected" ? "مرفوض" : "منتهٍ"}</span>{transaction.objectionText && <span>نص الاعتراض: {transaction.objectionText}</span>}</>}</div>{objectionPending && <><label className="manager-note"><span>ملاحظة القرار</span><textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="اختياري" maxLength={500} /></label><div className="decision-actions objection-actions"><button className="approve" onClick={() => void decideObjection("accept")} disabled={busy}><Check size={18} /> قبول الاعتراض</button><button className="reject" onClick={() => void decideObjection("reject")} disabled={busy}><X size={18} /> رفض الاعتراض</button></div></>}{editable && <><div className="edit-fields"><label><span>المبلغ</span><input type="number" min="0.01" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} /></label>{transaction.type === "expense" && <label><span>العنوان</span><input value={title} onChange={(event) => setTitle(event.target.value)} /></label>}<button className="secondary-button" onClick={saveEdit} disabled={busy}><FilePenLine size={17} /> حفظ التعديل</button></div><label className="manager-note"><span>ملاحظة المدير</span><textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="مطلوبة للتعليق أو الرفض" maxLength={500} /></label><div className="decision-actions"><button className="approve" onClick={() => void act("approve")} disabled={busy}><Check size={18} /> اعتماد</button><button className="hold" onClick={() => void act("hold")} disabled={busy}><CirclePause size={18} /> تعليق</button><button className="reject" onClick={() => void act("reject")} disabled={busy}><X size={18} /> رفض</button></div></>}{error && <div className="alert"><TriangleAlert size={16} />{error}</div>}</section></div>;
}

function adminStatus(status: CanonicalStatus): string { return status === "cancelled" ? "ملغية" : status === "approved" ? "معتمد" : status === "rejected" ? "مرفوض" : status === "on_hold" ? "معلّقة" : "بانتظار"; }
