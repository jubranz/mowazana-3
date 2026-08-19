import { NextRequest } from "next/server";
import { clientKey, noStoreJson, sameOrigin } from "@/lib/api-utils";
import { DEMO_PIN, demoProfiles } from "@/lib/demo-data";
import { isDemoMode } from "@/lib/env";
import { createSessionToken, SESSION_COOKIE, SESSION_MAX_AGE } from "@/lib/session";
import { pinLoginSchema } from "@/lib/validation";
import { verifyMemberPin } from "@/lib/wordpress";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return noStoreJson({ error: "طلب غير صالح." }, { status: 403 });
  const parsed = pinLoginSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return noStoreJson({ error: "أدخل رمزًا من 6 أرقام." }, { status: 400 });

  try {
    const { profileId, pin } = parsed.data;
    const profile = isDemoMode()
      ? pin === DEMO_PIN
        ? demoProfiles.find((item) => item.id === profileId)
        : null
      : await verifyMemberPin(profileId, pin, clientKey(request));

    if (!profile) return noStoreJson({ error: "الرمز غير صحيح." }, { status: 401 });

    const token = await createSessionToken({ memberId: profile.id, name: profile.name, color: profile.color });
    const response = noStoreJson({ profile, demo: isDemoMode() });
    response.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      maxAge: SESSION_MAX_AGE,
      priority: "high",
    });
    return response;
  } catch (error) {
    const message = error instanceof Error && error.message.includes("محاولات") ? error.message : "تعذر تسجيل الدخول الآن.";
    return noStoreJson({ error: message }, { status: 401 });
  }
}
