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
  const id = Number(memberId);
  if (!Number.isSafeInteger(id) || id <= 0) return noStoreJson({ error: "معرّف العضو غير صالح." }, { status: 400 });

  const query = new URLSearchParams();
  for (const key of ["status", "page", "perPage", "scope"]) {
    const value = request.nextUrl.searchParams.get(key);
    if (value) query.set(key, value);
  }
  try {
    const data = isDemoMode()
      ? getDemoTransactions(id, query.get("status") ?? "", Number(query.get("page") ?? 1), Number(query.get("perPage") ?? 5), query.get("scope") ?? "")
      : await getTransactions(id, query.toString());
    return noStoreJson(data);
  } catch {
    return noStoreJson({ error: "تعذر تحميل عمليات العضو الآن." }, { status: 503 });
  }
}
