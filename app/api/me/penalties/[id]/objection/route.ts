import { NextRequest } from "next/server";
import { noStoreJson, requireSession, sameOrigin } from "@/lib/api-utils";
import { isDemoMode } from "@/lib/env";
import { submitDemoPenaltyObjection } from "@/lib/demo-data";
import { penaltyObjectionSchema } from "@/lib/validation";
import { submitPenaltyObjection } from "@/lib/wordpress";

export const runtime = "nodejs";

export async function POST(request: NextRequest, context: RouteContext<"/api/me/penalties/[id]/objection">) {
  if (!sameOrigin(request)) return noStoreJson({ error: "طلب غير صالح." }, { status: 403 });
  const auth = await requireSession();
  if (!auth.session) return auth.error;
  const { id } = await context.params;
  if (!/^\d+$/.test(id)) return noStoreJson({ error: "المخالفة غير صالحة." }, { status: 400 });
  const parsed = penaltyObjectionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return noStoreJson({ error: "اكتب سبب الاعتراض بوضوح." }, { status: 400 });
  try {
    const transaction = isDemoMode()
      ? submitDemoPenaltyObjection(auth.session.memberId, Number(id), parsed.data.text)
      : await submitPenaltyObjection(auth.session.memberId, Number(id), parsed.data);
    if (!transaction) return noStoreJson({ error: "لا يمكن الاعتراض على هذه المخالفة." }, { status: 409 });
    return noStoreJson({ transaction });
  } catch (cause) {
    return noStoreJson({ error: cause instanceof Error ? cause.message : "تعذر إرسال الاعتراض." }, { status: 409 });
  }
}
