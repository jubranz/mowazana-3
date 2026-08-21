import { NextRequest } from "next/server";
import { noStoreJson, requireSession } from "@/lib/api-utils";
import { getDemoTransactions } from "@/lib/demo-data";
import { isDemoMode } from "@/lib/env";
import { getTransactions } from "@/lib/wordpress";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await requireSession();
  if (!auth.session) return auth.error;
  const type = request.nextUrl.searchParams.get("type") ?? "";
  const status = request.nextUrl.searchParams.get("status") ?? "";
  const page = Math.max(1, Number(request.nextUrl.searchParams.get("page") ?? 1));
  const perPage = Math.min(25, Math.max(1, Number(request.nextUrl.searchParams.get("perPage") ?? 5)));
  const query = new URLSearchParams();
  if (type) query.set("type", type);
  if (status) query.set("status", status);
  query.set("page", String(page));
  query.set("perPage", String(perPage));

  try {
    const result = isDemoMode()
      ? getDemoTransactions(auth.session.memberId, status, page, perPage)
      : await getTransactions(auth.session.memberId, query.toString());
    return noStoreJson(result);
  } catch {
    return noStoreJson({ error: "تعذر تحميل العمليات." }, { status: 503 });
  }
}
