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
  const id = Number(memberId);
  if (!Number.isSafeInteger(id) || id <= 0) return noStoreJson({ error: "معرّف العضو غير صالح." }, { status: 400 });

  try {
    return noStoreJson(isDemoMode() ? getDemoDashboard(id) : await getDashboard(id));
  } catch {
    return noStoreJson({ error: "تعذر تحميل بيانات العضو الآن." }, { status: 503 });
  }
}
