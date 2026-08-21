import { NextRequest } from "next/server";
import { noStoreJson, requireManagerSession, sameOrigin } from "@/lib/api-utils";
import { editDemoTransaction } from "@/lib/demo-data";
import { isDemoMode } from "@/lib/env";
import { adminEditTransactionSchema } from "@/lib/validation";
import { editAdminTransaction } from "@/lib/wordpress";

export async function PATCH(request: NextRequest, context: RouteContext<"/api/admin/transactions/[type]/[id]">) {
  if (!sameOrigin(request)) return noStoreJson({ error: "طلب غير صالح." }, { status: 403 });
  const auth = await requireManagerSession();
  if (!auth.session) return auth.error;
  const { type, id } = await context.params;
  if (!/^(expense|payment|loan_payment)$/.test(type) || !/^\d+$/.test(id)) return noStoreJson({ error: "عملية غير صالحة." }, { status: 400 });
  const parsed = adminEditTransactionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return noStoreJson({ error: "تحقق من التعديلات." }, { status: 400 });
  try {
    const transaction = isDemoMode()
      ? editDemoTransaction(type, Number(id), parsed.data)
      : await editAdminTransaction(auth.session.memberId, type, Number(id), parsed.data);
    if (!transaction) return noStoreJson({ error: "لا يمكن تعديل هذه العملية." }, { status: 409 });
    return noStoreJson({ transaction });
  } catch (cause) {
    return noStoreJson({ error: cause instanceof Error ? cause.message : "تعذر تعديل العملية." }, { status: 503 });
  }
}
