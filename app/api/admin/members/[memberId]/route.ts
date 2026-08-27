import { NextRequest } from "next/server";
import { z } from "zod";
import { noStoreJson, requireManagerSession, sameOrigin } from "@/lib/api-utils";
import { isDemoMode } from "@/lib/env";
import { hashPin } from "@/lib/pin";
import { supabaseAdmin } from "@/lib/supabase";

const updateSchema = z.object({ name: z.string().trim().min(2).max(80), color: z.string().regex(/^#[0-9a-fA-F]{6}$/), role: z.enum(["member", "manager"]), active: z.boolean(), pin: z.string().regex(/^\d{6}$/).optional() });
function initials(name: string) { return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join(""); }

export async function PATCH(request: NextRequest, context: RouteContext<"/api/admin/members/[memberId]">) {
  if (!sameOrigin(request)) return noStoreJson({ error: "طلب غير صالح." }, { status: 403 });
  const auth = await requireManagerSession();
  if (!auth.session) return auth.error;
  const { memberId } = await context.params;
  if (!z.string().uuid().safeParse(memberId).success || isDemoMode()) return noStoreJson({ error: "العضو غير صالح." }, { status: 400 });
  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return noStoreJson({ error: "تحقق من بيانات العضو." }, { status: 400 });
  const admin = supabaseAdmin();
  try {
    const { data: current, error: currentError } = await admin.from("profiles").select("id,role,active").eq("id", memberId).single();
    if (currentError || !current) return noStoreJson({ error: "العضو غير موجود." }, { status: 404 });
    const removesLastManager = current.role === "manager" && current.active && (parsed.data.role !== "manager" || !parsed.data.active);
    if (removesLastManager) {
      const { count, error } = await admin.from("profiles").select("id", { count: "exact", head: true }).eq("role", "manager").eq("active", true);
      if (error) throw error;
      if ((count ?? 0) <= 1) return noStoreJson({ error: "لا يمكن تعطيل آخر مدير نشط." }, { status: 409 });
    }
    const changes: Record<string, unknown> = { name: parsed.data.name, color: parsed.data.color, role: parsed.data.role, active: parsed.data.active };
    if (parsed.data.pin) changes.pin_hash = await hashPin(parsed.data.pin);
    const { data: profile, error } = await admin.from("profiles").update(changes).eq("id", memberId).select("id,name,color,role,active").single();
    if (error) throw error;
    await admin.from("audit_log").insert({ actor_id: auth.session.memberId, action: "member.updated", entity_type: "profile", entity_id: memberId, after_values: { ...parsed.data, pin: undefined } });
    return noStoreJson({ member: { ...profile, initials: initials(profile.name), canManage: profile.role === "manager" } });
  } catch (cause) {
    return noStoreJson({ error: cause instanceof Error ? cause.message : "تعذر تحديث العضو." }, { status: 503 });
  }
}
