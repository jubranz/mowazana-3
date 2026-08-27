import { NextRequest } from "next/server";
import { noStoreJson, sameOrigin } from "@/lib/api-utils";
import { supabaseAdmin } from "@/lib/supabase";

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return noStoreJson({ error: "طلب غير صالح." }, { status: 403 });
  const body = await request.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!/^\S+@\S+\.\S+$/.test(email)) return noStoreJson({ error: "أدخل بريدًا إلكترونيًا صحيحًا." }, { status: 400 });
  try {
    const admin = supabaseAdmin();
    const { data } = await admin.from("profiles").select("id").eq("email", email).eq("active", true).maybeSingle();
    if (!data && !(process.env.INITIAL_MANAGER_EMAILS ?? "").split(",").map((item) => item.trim().toLowerCase()).includes(email)) {
      return noStoreJson({ ok: true }); // Do not disclose whether a member exists.
    }
    const origin = new URL(process.env.NEXT_PUBLIC_APP_URL?.trim() || request.nextUrl.origin).origin;
    const { error } = await admin.auth.signInWithOtp({ email, options: { emailRedirectTo: `${origin}/api/auth/callback`, shouldCreateUser: Boolean(!data) } });
    if (error) throw error;
    return noStoreJson({ ok: true });
  } catch { return noStoreJson({ error: "تعذر إرسال رابط الدخول الآن." }, { status: 503 }); }
}
