"use client";

import { ArrowLeft, Bell, CheckCheck, MessageCircleWarning, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { FinancialTransaction, NotificationItem } from "@/lib/types";
import { PenaltyDetailsDialog } from "@/components/penalty-details-dialog";

const formatter = new Intl.DateTimeFormat("ar-SA-u-ca-gregory", {
  day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Asia/Riyadh",
});

export function NotificationsPage({ onBack }: { onBack: () => void }) {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [details, setDetails] = useState<FinancialTransaction | null>(null);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const response = await fetch("/api/me/notifications", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "تعذر تحميل الإشعارات.");
      setItems(payload.notifications ?? []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر تحميل الإشعارات.");
    } finally { setBusy(false); }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function markAllRead() {
    await fetch("/api/me/notifications", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ all: true }) });
    setItems((current) => current.map((item) => ({ ...item, readAt: item.readAt ?? new Date().toISOString() })));
  }

  return (
    <main className="app-shell notifications-page">
      <header className="app-header page-toolbar">
        <button className="back-button page-back" onClick={onBack}><ArrowLeft size={20} /> الرئيسية</button>
        <div className="header-actions"><button className="icon-button" onClick={() => void load()} aria-label="تحديث"><RefreshCw size={20} className={busy ? "spin" : ""} /></button></div>
      </header>
      <section className="page-intro"><div className="eyebrow"><Bell size={16} /> مركز التنبيهات</div><h1>إشعاراتك</h1><p>قرارات العمليات، ملاحظات المدير، واستحقاقات الأقساط في مكان واحد.</p></section>
      <div className="section-title notifications-title"><div><span>{items.filter((item) => !item.readAt).length} غير مقروء</span><h2>الأحدث أولًا</h2></div>{items.some((item) => !item.readAt) && <button className="text-button" onClick={markAllRead}><CheckCheck size={17} /> تعليم الكل كمقروء</button>}</div>
      {error && <div className="alert" role="alert">{error}</div>}
      <section className="notification-list">
        {!busy && !items.length && <div className="empty-state"><CheckCheck size={22} /><span>لا توجد إشعارات بعد</span></div>}
        {items.map((item) => { const transaction = penaltyNotificationTransaction(item); return <article className={`notification-card ${item.readAt ? "" : "unread"}`} key={item.id}><span className="notification-dot" />{transaction && <span className="notification-objection-icon" title="يمكن الاعتراض خلال 15 يومًا"><MessageCircleWarning size={17} /></span>}<div><strong>{item.title}</strong><p>{item.body}</p><time>{formatter.format(new Date(item.createdAt))}</time>{transaction && <button className="notification-details-button" onClick={() => setDetails(transaction)}>اضغط للتفاصيل</button>}</div></article>;})}
      </section>
      {details && <PenaltyDetailsDialog transaction={details} onClose={() => setDetails(null)} onSubmitted={() => void load()} />}
    </main>
  );
}

function penaltyNotificationTransaction(item: NotificationItem): FinancialTransaction | null {
  if (item.payload?.transaction?.type === "penalty") return item.payload.transaction;
  if (item.entityType !== "penalty" || !item.entityId) return null;
  return { id: item.entityId, type: "penalty", title: item.title.replace(/^.*مخالفة\s*-?\s*/, "") || "مخالفة", amount: 0, date: item.createdAt, status: "approved", note: item.body, imageUrl: item.payload?.imageUrl, canObject: item.payload?.canObject, objectionDeadline: item.payload?.objectionDeadline ?? undefined };
}
