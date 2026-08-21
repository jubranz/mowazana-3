import { createHash, randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { readSession } from "./session";

export function noStoreJson(body: unknown, init?: ResponseInit): NextResponse {
  const response = NextResponse.json(body, init);
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  response.headers.set("Pragma", "no-cache");
  return response;
}

export function clientKey(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const agent = request.headers.get("user-agent") ?? "unknown";
  return createHash("sha256").update(`${forwarded}|${agent}`).digest("hex").slice(0, 32);
}

export function sameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === request.nextUrl.host;
  } catch {
    return false;
  }
}

export async function requireSession() {
  const session = await readSession();
  if (!session) return { session: null, error: noStoreJson({ error: "unauthorized" }, { status: 401 }) };
  return { session, error: null };
}

export async function requireManagerSession() {
  const auth = await requireSession();
  if (!auth.session) return auth;
  if (!auth.session.canManage) {
    try {
      const [{ isDemoMode }, { demoProfiles }, { getDashboard }] = await Promise.all([
        import("./env"), import("./demo-data"), import("./wordpress"),
      ]);
      const currentlyAllowed = isDemoMode()
        ? Boolean(demoProfiles.find((profile) => profile.id === auth.session?.memberId)?.canManage)
        : Boolean((await getDashboard(auth.session.memberId)).member.canManage);
      if (currentlyAllowed) return { session: { ...auth.session, canManage: true }, error: null };
    } catch {
      // Fall through to the same generic authorization response.
    }
    return { session: null, error: noStoreJson({ error: "غير مصرح لك بإدارة موازنة." }, { status: 403 }) };
  }
  return auth;
}

export function requestId(value?: string): string {
  return value && /^[a-zA-Z0-9-]{16,64}$/.test(value) ? value : randomUUID();
}
