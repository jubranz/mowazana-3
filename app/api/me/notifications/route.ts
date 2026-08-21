import { NextRequest } from "next/server";
import { noStoreJson, requireManagerSession, requireSession, sameOrigin } from "@/lib/api-utils";
import { getDemoNotifications, markDemoNotificationsRead } from "@/lib/demo-data";
import { isDemoMode } from "@/lib/env";
import { notificationReadSchema } from "@/lib/validation";
import { getNotifications, markNotificationsRead } from "@/lib/wordpress";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const manager = request.nextUrl.searchParams.get("audience") === "manager";
  const auth = manager ? await requireManagerSession() : await requireSession();
  if (!auth.session) return auth.error;
  try {
    if (isDemoMode()) {
      const notifications = getDemoNotifications(manager);
      return noStoreJson({ notifications, unread: notifications.filter((item) => !item.readAt).length });
    }
    return noStoreJson(await getNotifications(auth.session.memberId, manager));
  } catch {
    return noStoreJson({ error: "تعذر تحميل الإشعارات." }, { status: 503 });
  }
}

export async function PATCH(request: NextRequest) {
  if (!sameOrigin(request)) return noStoreJson({ error: "طلب غير صالح." }, { status: 403 });
  const manager = request.nextUrl.searchParams.get("audience") === "manager";
  const auth = manager ? await requireManagerSession() : await requireSession();
  if (!auth.session) return auth.error;
  const parsed = notificationReadSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return noStoreJson({ error: "طلب غير صالح." }, { status: 400 });
  try {
    if (isDemoMode()) markDemoNotificationsRead(manager, parsed.data.id);
    else await markNotificationsRead(auth.session.memberId, { ...parsed.data, manager });
    return noStoreJson({ ok: true });
  } catch {
    return noStoreJson({ error: "تعذر تحديث الإشعارات." }, { status: 503 });
  }
}
