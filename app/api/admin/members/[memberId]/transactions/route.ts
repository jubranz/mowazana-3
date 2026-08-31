import { NextRequest } from "next/server";
import { noStoreJson, requireManagerSession } from "@/lib/api-utils";
import { getDemoTransactions } from "@/lib/demo-data";
import { isDemoMode } from "@/lib/env";
import { getTransactions } from "@/lib/wordpress";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, context: RouteContext<"/api/admin/members/[memberId]/transactions">) {
  const auth = await requireManagerSession();
  if (!auth.session) return auth.error;
  const { memberId } = await context.params;
  const demoId = Number(memberId);
  const validId = isDemoMode()
    ? Number.isSafeInteger(demoId) && demoId > 0
    : /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(memberId);
  if (!validId) return noStoreJson({ error: "معرّف العضو غير صالح." }, { status: 400 });

  const query = new URLSearchParams();
  for (const key of ["status", "page", "perPage", "scope"]) {
    const value = request.nextUrl.searchParams.get(key);
    if (value) query.set(key, value);
  }
  try {
    const data = isDemoMode()
      ? getDemoTransactions(demoId, query.get("status") ?? "", Number(query.get("page") ?? 1), Number(query.get("perPage") ?? 5), query.get("scope") ?? "")
      : await getTransactions(memberId, query.toString());
    return noStoreJson(data);
  } catch {
    return noStoreJson({ error: "تعذر تحميل عمليات العضو الآن." }, { status: 503 });
  }
}
