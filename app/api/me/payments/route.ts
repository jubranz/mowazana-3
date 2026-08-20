import { NextRequest } from "next/server";
import { noStoreJson, requireSession, sameOrigin } from "@/lib/api-utils";
import { createDemoPayment, getDemoDashboard } from "@/lib/demo-data";
import { isDemoMode } from "@/lib/env";
import { paymentSchema } from "@/lib/validation";
import { createPayment } from "@/lib/wordpress";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return noStoreJson({ error: "طلب غير صالح." }, { status: 403 });
  const auth = await requireSession();
  if (!auth.session) return auth.error;
  const parsed = paymentSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return noStoreJson({ error: "تحقق من المبلغ ووجهة السداد." }, { status: 400 });

  try {
    const transaction = isDemoMode()
      ? createDemoPayment(auth.session.memberId, parsed.data)
      : await createPayment(auth.session.memberId, parsed.data);
    return noStoreJson({ transaction, dashboard: isDemoMode() ? getDemoDashboard(auth.session.memberId) : undefined }, { status: 201 });
  } catch {
    return noStoreJson({ error: "لم يُحفظ السداد. حاول مرة أخرى." }, { status: 503 });
  }
}
