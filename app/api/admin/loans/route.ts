import { NextRequest } from "next/server";
import { noStoreJson, requireManagerSession, sameOrigin } from "@/lib/api-utils";
import { createDemoLoan } from "@/lib/demo-data";
import { isDemoMode } from "@/lib/env";
import { loanSchema } from "@/lib/validation";
import { createAdminLoan } from "@/lib/wordpress";

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return noStoreJson({ error: "طلب غير صالح." }, { status: 403 });
  const auth = await requireManagerSession();
  if (!auth.session) return auth.error;
  const parsed = loanSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return noStoreJson({ error: "تحقق من بيانات القرض." }, { status: 400 });
  try {
    const loan = isDemoMode() ? createDemoLoan(parsed.data) : await createAdminLoan(auth.session.memberId, parsed.data);
    return noStoreJson({ loan }, { status: 201 });
  } catch (cause) {
    return noStoreJson({ error: cause instanceof Error ? cause.message : "تعذر إنشاء القرض." }, { status: 503 });
  }
}
