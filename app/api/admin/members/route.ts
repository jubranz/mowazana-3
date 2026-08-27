import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { z } from "zod";
import { noStoreJson, requireManagerSession, sameOrigin } from "@/lib/api-utils";
import { isDemoMode } from "@/lib/env";
import { hashPin } from "@/lib/pin";
import { supabaseAdmin } from "@/lib/supabase";

const memberSchema = z.object({
  name: z.string().trim().min(2).max(80),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  role: z.enum(["member", "manager"]),
  pin: z.string().regex(/^\d{6}$/),
});

function initials(name: string) { return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join(""); }
function shape(row: { id: string; name: string; color: string; role: "member" | "manager"; active: boolean }) {
  return { id: row.id, name: row.name, initials: initials(row.name), color: row.color, role: row.role, active: row.active, canManage: row.role === "manager" };
}

export async function GET() {
  const auth = await requireManagerSession();
  if (!auth.session) return auth.error;
  if (isDemoMode()) return noStoreJson({ members: [] });
  try {
    const { data, error } = await supabaseAdmin().from("profiles").select("id,name,color,role,active").order("created_at");
    if (error) throw error;
    return noStoreJson({ members: (data ?? []).map(shape) });
  } catch {
    return noStoreJson({ error: "تعذر تحميل الأعضاء." }, { status: 503 });
  }
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return noStoreJson({ error: "طلب غير صالح." }, { status: 403 });
  const auth = await requireManagerSession();
  if (!auth.session) return auth.error;
  if (isDemoMode()) return noStoreJson({ error: "إدارة الأعضاء غير متاحة في وضع العرض." }, { status: 400 });
  const parsed = memberSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return noStoreJson({ error: "تحقق من الاسم واللون والرمز المكوّن من 6 أرقام." }, { status: 400 });

  const admin = supabaseAdmin();
  const internalEmail = `member-${randomUUID()}@mowazana.local`;
  try {
    const { data: created, error: createError } = await admin.auth.admin.createUser({ email: internalEmail, email_confirm: true, user_metadata: { name: parsed.data.name } });
    if (createError || !created.user) throw createError ?? new Error("تعذر إنشاء الحساب.");
    const pinHash = await hashPin(parsed.data.pin);
    const { data: profile, error: profileError } = await admin.from("profiles").update({ name: parsed.data.name, color: parsed.data.color, role: parsed.data.role, active: true, pin_hash: pinHash }).eq("id", created.user.id).select("id,name,color,role,active").single();
    if (profileError) {
      await admin.auth.admin.deleteUser(created.user.id);
      throw profileError;
    }
    await admin.from("audit_log").insert({ actor_id: auth.session.memberId, action: "member.created", entity_type: "profile", entity_id: created.user.id, after_values: { name: parsed.data.name, role: parsed.data.role } });
    return noStoreJson({ member: shape(profile) }, { status: 201 });
  } catch (cause) {
    return noStoreJson({ error: cause instanceof Error ? cause.message : "تعذر إنشاء العضو." }, { status: 503 });
  }
}
