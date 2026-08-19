import { NextRequest } from "next/server";
import { noStoreJson, requireSession } from "@/lib/api-utils";
import { getDemoDashboard } from "@/lib/demo-data";
import { isDemoMode } from "@/lib/env";
import { getTransactions } from "@/lib/wordpress";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await requireSession();
  if (!auth.session) return auth.error;
  const type = request.nextUrl.searchParams.get("type") ?? "";
  const cursor = request.nextUrl.searchParams.get("cursor") ?? "";
  const query = new URLSearchParams();
  if (type) query.set("type", type);
  if (cursor) query.set("cursor", cursor);

  try {
    const transactions = isDemoMode()
      ? getDemoDashboard(auth.session.memberId).recent.filter((item) => !type || item.type === type)
      : await getTransactions(auth.session.memberId, query.toString());
    return noStoreJson({ transactions });
  } catch {
    return noStoreJson({ error: "تعذر تحميل العمليات." }, { status: 503 });
  }
}
