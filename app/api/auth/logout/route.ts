import { NextRequest } from "next/server";
import { noStoreJson, sameOrigin } from "@/lib/api-utils";
import { supabaseServer } from "@/lib/supabase";

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return noStoreJson({ error: "طلب غير صالح." }, { status: 403 });
  await (await supabaseServer()).auth.signOut();
  return noStoreJson({ ok: true });
}
