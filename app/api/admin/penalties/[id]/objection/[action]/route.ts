import { NextRequest } from "next/server";
import { noStoreJson, requireManagerSession, sameOrigin } from "@/lib/api-utils";
import { decideDemoPenaltyObjection } from "@/lib/demo-data";
import { isDemoMode } from "@/lib/env";
import { adminActionSchema } from "@/lib/validation";
import { decidePenaltyObjection } from "@/lib/wordpress";

export async function POST(request: NextRequest, context: RouteContext<"/api/admin/penalties/[id]/objection/[action]">) {
  if (!sameOrigin(request)) return noStoreJson({ error: "طلب غير صالح." }, { status: 403 });
  const auth = await requireManagerSession();
  if (!auth.session) return auth.error;
  const { id, action } = await context.params;
  if (!/^\d+$/.test(id) || !/^(accept|reject)$/.test(action)) return noStoreJson({ error: "إجراء اعتراض غير صالح." }, { status: 400 });
  const parsed = adminActionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return noStoreJson({ error: "الملاحظة غير صالحة." }, { status: 400 });
  try {
    const transaction = isDemoMode()
      ? decideDemoPenaltyObjection(Number(id), action as "accept" | "reject", parsed.data.note)
      : await decidePenaltyObjection(auth.session.memberId, Number(id), action as "accept" | "reject", parsed.data.note);
    if (!transaction) return noStoreJson({ error: "لا يوجد اعتراض بانتظار القرار." }, { status: 409 });
    return noStoreJson({ transaction });
  } catch (cause) {
    return noStoreJson({ error: cause instanceof Error ? cause.message : "تعذر اتخاذ القرار." }, { status: 409 });
  }
}
