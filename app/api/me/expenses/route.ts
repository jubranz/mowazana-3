import { NextRequest } from "next/server";
import { noStoreJson, requireSession, sameOrigin } from "@/lib/api-utils";
import { createDemoExpense, getDemoDashboard } from "@/lib/demo-data";
import { isDemoMode } from "@/lib/env";
import { expenseSchema } from "@/lib/validation";
import { createExpense } from "@/lib/wordpress";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return noStoreJson({ error: "طلب غير صالح." }, { status: 403 });
  const auth = await requireSession();
  if (!auth.session) return auth.error;
  const parsed = expenseSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return noStoreJson({ error: "تحقق من المبلغ والتفاصيل." }, { status: 400 });

  try {
    const transaction = isDemoMode()
      ? createDemoExpense(auth.session.memberId, parsed.data)
      : await createExpense(auth.session.memberId, parsed.data);
    return noStoreJson({ transaction, dashboard: isDemoMode() ? getDemoDashboard(auth.session.memberId) : undefined }, { status: 201 });
  } catch {
    return noStoreJson({ error: "لم تُحفظ العملية. حاول مرة أخرى." }, { status: 503 });
  }
}
