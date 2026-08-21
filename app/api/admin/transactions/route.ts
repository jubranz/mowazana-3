import { NextRequest } from "next/server";
import { noStoreJson, requireManagerSession, sameOrigin } from "@/lib/api-utils";
import { createDemoAdminTransaction } from "@/lib/demo-data";
import { isDemoMode } from "@/lib/env";
import { adminTransactionSchema } from "@/lib/validation";
import { createAdminTransaction } from "@/lib/wordpress";

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return noStoreJson({ error: "طلب غير صالح." }, { status: 403 });
  const auth = await requireManagerSession();
  if (!auth.session) return auth.error;
  const parsed = adminTransactionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return noStoreJson({ error: "تحقق من بيانات العملية." }, { status: 400 });
  try {
    const transaction = isDemoMode()
      ? createDemoAdminTransaction(parsed.data, auth.session.memberId)
      : await createAdminTransaction(auth.session.memberId, parsed.data);
    return noStoreJson({ transaction }, { status: 201 });
  } catch (cause) {
    return noStoreJson({ error: cause instanceof Error ? cause.message : "تعذر حفظ العملية." }, { status: 503 });
  }
}
