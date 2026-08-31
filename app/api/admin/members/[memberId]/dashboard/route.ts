import { NextRequest } from "next/server";
import { noStoreJson, requireManagerSession } from "@/lib/api-utils";
import { getDemoDashboard } from "@/lib/demo-data";
import { isDemoMode } from "@/lib/env";
import { getDashboard } from "@/lib/wordpress";

export const dynamic = "force-dynamic";

export async function GET(_request: NextRequest, context: RouteContext<"/api/admin/members/[memberId]/dashboard">) {
  const auth = await requireManagerSession();
  if (!auth.session) return auth.error;
  const { memberId } = await context.params;
  const demoId = Number(memberId);
  const validId = isDemoMode()
    ? Number.isSafeInteger(demoId) && demoId > 0
    : /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(memberId);
  if (!validId) return noStoreJson({ error: "معرّف العضو غير صالح." }, { status: 400 });

  try {
    return noStoreJson(isDemoMode() ? getDemoDashboard(demoId) : await getDashboard(memberId));
  } catch {
    return noStoreJson({ error: "تعذر تحميل بيانات العضو الآن." }, { status: 503 });
  }
}
