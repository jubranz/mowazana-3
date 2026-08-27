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
    const initialManagers = (process.env.INITIAL_MANAGER_EMAILS ?? "").split(",").map((item) => item.trim().toLowerCase());
    const isInitialManager = initialManagers.includes(email);
    let { data: profile } = await admin.from("profiles").select("id").eq("email", email).eq("active", true).maybeSingle();
    if (!profile && !isInitialManager) {
      return noStoreJson({ ok: true }); // Do not disclose whether a member exists.
    }
    if (!profile && isInitialManager) {
      const { error } = await admin.auth.admin.createUser({ email, email_confirm: true });
      if (error && !/already been registered/i.test(error.message)) throw error;
      const result = await admin.from("profiles").select("id").eq("email", email).maybeSingle();
      profile = result.data;
    }
    if (isInitialManager) {
      const { error } = await admin.from("profiles").update({ role: "manager", active: true }).eq("email", email);
      if (error) throw error;
    }
    const origin = new URL(process.env.INTERNAL_APP_URL?.trim() || process.env.NEXT_PUBLIC_APP_URL?.trim() || request.nextUrl.origin).origin;
    const { error } = await admin.auth.signInWithOtp({ email, options: { emailRedirectTo: `${origin}/api/auth/callback`, shouldCreateUser: false } });
    if (error) throw error;
    return noStoreJson({ ok: true });
  } catch { return noStoreJson({ error: "تعذر إرسال رابط الدخول الآن." }, { status: 503 }); }
}
