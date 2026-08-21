"use client";

/* Dynamic WordPress media URLs are not known at build time. */
/* eslint-disable @next/next/no-img-element */

import { MessageCircleWarning, X } from "lucide-react";
import { useState } from "react";
import type { FinancialTransaction } from "@/lib/types";

const moneyFormatter = new Intl.NumberFormat("ar-SA", { maximumFractionDigits: 2 });
const dateFormatter = new Intl.DateTimeFormat("ar-SA-u-ca-gregory", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Riyadh" });

export function PenaltyDetailsDialog({ transaction, onClose, onSubmitted }: { transaction: FinancialTransaction; onClose: () => void; onSubmitted?: () => void }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [imageUnavailable, setImageUnavailable] = useState(false);
  const appealDeadline = transaction.objectionDeadline ? new Date(transaction.objectionDeadline) : new Date(new Date(transaction.date).getTime() + 15 * 24 * 60 * 60 * 1000);
  const canSubmitObjection = !["pending", "accepted", "rejected", "expired"].includes(transaction.objectionStatus ?? "none") && appealDeadline >= new Date();
  const imageSource = transaction.imageUrl ? `/api/me/penalties/${transaction.id}/image?source=${encodeURIComponent(transaction.imageUrl)}` : "";

  async function submit() {
    if (text.trim().length < 2) return setError("اكتب سبب الاعتراض.");
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/me/penalties/${transaction.id}/objection`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? "تعذر إرسال الاعتراض.");
      onSubmitted?.();
      onClose();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "تعذر إرسال الاعتراض."); }
    finally { setBusy(false); }
  }

  return <div className="sheet-layer" role="dialog" aria-modal="true" aria-labelledby="penalty-details-title">
    <button className="sheet-backdrop" aria-label="إغلاق التفاصيل" onClick={onClose} />
    <section className="penalty-details-dialog">
      <header><div><span>تفاصيل المخالفة</span><h2 id="penalty-details-title">مخالفة - {transaction.title}</h2></div><button onClick={onClose} aria-label="إغلاق"><X size={20} /></button></header>
      {imageSource && !imageUnavailable ? <img className="penalty-details-image" src={imageSource} alt={`صورة مخالفة ${transaction.title}`} onError={() => setImageUnavailable(true)} /> : <div className="penalty-image-empty">لا توجد صورة مرفقة أو تعذر تحميلها</div>}
      <div className="penalty-details-summary"><div><span>المبلغ</span><strong>{moneyFormatter.format(transaction.amount)} ريال</strong></div><div><span>التاريخ</span><strong>{dateFormatter.format(new Date(transaction.date))}</strong></div>{transaction.note && <p>{transaction.note}</p>}</div>
      {canSubmitObjection && <div className="penalty-objection-form"><h3><MessageCircleWarning size={18} /> اعتراض على المخالفة</h3><p>يمكنك إرسال اعتراضك خلال 15 يومًا من تاريخ المخالفة.</p><textarea value={text} onChange={(event) => setText(event.target.value)} placeholder="اكتب سبب اعتراضك" maxLength={1000} />{error && <small className="form-error">{error}</small>}<button className="primary-button" onClick={() => void submit()} disabled={busy}>{busy ? "جارٍ الإرسال…" : "إرسال الاعتراض"}</button></div>}
      {transaction.objectionStatus === "pending" && <p className="objection-status">تم إرسال اعتراضك وهو بانتظار مراجعة المدير.</p>}
      {transaction.objectionStatus === "accepted" && <p className="objection-status accepted">تم قبول اعتراضك على هذه المخالفة.</p>}
      {transaction.objectionStatus === "rejected" && <p className="objection-status rejected">تم رفض اعتراضك على هذه المخالفة.</p>}
    </section>
  </div>;
}
