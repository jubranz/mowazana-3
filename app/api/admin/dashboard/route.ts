import { NextRequest } from "next/server";
import { noStoreJson, requireManagerSession } from "@/lib/api-utils";
import { getDemoAdminDashboard } from "@/lib/demo-data";
import { isDemoMode } from "@/lib/env";
import { getAdminDashboard } from "@/lib/wordpress";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await requireManagerSession();
  if (!auth.session) return auth.error;
  const query = new URLSearchParams();
  for (const key of ["status", "type", "memberId", "page", "perPage"]) {
    const value = request.nextUrl.searchParams.get(key);
    if (value) query.set(key, value);
  }
  try {
    const data = isDemoMode()
      ? getDemoAdminDashboard({
          status: query.get("status") ?? undefined,
          type: query.get("type") ?? undefined,
          memberId: query.get("memberId") ? Number(query.get("memberId")) : undefined,
          page: query.get("page") ? Number(query.get("page")) : undefined,
          perPage: query.get("perPage") ? Number(query.get("perPage")) : undefined,
        })
      : await getAdminDashboard(auth.session.memberId, query.toString());
    return noStoreJson(data);
  } catch {
    return noStoreJson({ error: "تعذر تحميل لوحة الإدارة." }, { status: 503 });
  }
}
