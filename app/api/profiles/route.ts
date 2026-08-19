import { noStoreJson } from "@/lib/api-utils";
import { demoProfiles } from "@/lib/demo-data";
import { isDemoMode } from "@/lib/env";
import { getProfiles } from "@/lib/wordpress";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const profiles = isDemoMode() ? demoProfiles : await getProfiles();
    return noStoreJson({ profiles, demo: isDemoMode() });
  } catch {
    return noStoreJson({ error: "تعذر تحميل الأعضاء الآن." }, { status: 503 });
  }
}
