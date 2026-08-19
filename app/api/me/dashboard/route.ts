import { noStoreJson, requireSession } from "@/lib/api-utils";
import { getDemoDashboard } from "@/lib/demo-data";
import { isDemoMode } from "@/lib/env";
import { getDashboard } from "@/lib/wordpress";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireSession();
  if (!auth.session) return auth.error;
  try {
    const dashboard = isDemoMode()
      ? getDemoDashboard(auth.session.memberId)
      : await getDashboard(auth.session.memberId);
    return noStoreJson(dashboard);
  } catch {
    return noStoreJson({ error: "تعذر تحديث بياناتك الآن." }, { status: 503 });
  }
}
