import { NextRequest } from "next/server";
import { noStoreJson, requireManagerSession, sameOrigin } from "@/lib/api-utils";
import { transitionDemoTransaction } from "@/lib/demo-data";
import { isDemoMode } from "@/lib/env";
import { adminActionSchema } from "@/lib/validation";
import { transitionAdminTransaction } from "@/lib/wordpress";

export async function POST(request: NextRequest, context: RouteContext<"/api/admin/transactions/[type]/[id]/[action]">) {
  if (!sameOrigin(request)) return noStoreJson({ error: "طلب غير صالح." }, { status: 403 });
  const auth = await requireManagerSession();
  if (!auth.session) return auth.error;
  const { type, id, action } = await context.params;
  const validId = isDemoMode() ? /^\d+$/.test(id) : /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
  if (!/^(expense|payment|loan_payment)$/.test(type) || !validId || !/^(approve|hold|reject)$/.test(action)) {
    return noStoreJson({ error: "إجراء غير صالح." }, { status: 400 });
  }
  const parsed = adminActionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || (["hold", "reject"].includes(action) && parsed.data.note.length < 2)) {
    return noStoreJson({ error: "الملاحظة مطلوبة للتعليق أو الرفض." }, { status: 400 });
  }
  try {
    const transaction = isDemoMode()
      ? transitionDemoTransaction(type, Number(id), action as "approve" | "hold" | "reject", parsed.data.note)
      : await transitionAdminTransaction(auth.session.memberId, type, id, action, parsed.data.note);
    if (!transaction) return noStoreJson({ error: "لا يمكن تغيير حالة العملية." }, { status: 409 });
    return noStoreJson({ transaction });
  } catch (cause) {
    return noStoreJson({ error: cause instanceof Error ? cause.message : "تعذر تنفيذ القرار." }, { status: 503 });
  }
}
