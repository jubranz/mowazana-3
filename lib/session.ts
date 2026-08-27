import type { SessionPayload } from "./types";
import { supabaseAdmin, supabaseServer } from "./supabase";
import { jwtVerify, SignJWT } from "jose";
import { cookies } from "next/headers";

export const SESSION_COOKIE = "muwazana_session";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 30;

function sessionSecret(): Uint8Array {
  const secret = process.env.SESSION_SECRET || process.env.PRIVATE_SUPABASE_SERVICE_ROLE_KEY || process.env.INTERNAL_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error("SESSION_SECRET is not configured");
  return new TextEncoder().encode(secret);
}

export async function createSessionToken(payload: SessionPayload): Promise<string> {
  return new SignJWT({ ...payload }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("30d").sign(sessionSecret());
}

export async function readSession(): Promise<SessionPayload | null> {
  try {
    const token = (await cookies()).get(SESSION_COOKIE)?.value;
    if (token) {
      const { payload } = await jwtVerify(token, sessionSecret());
      const memberId = typeof payload.memberId === "string" || typeof payload.memberId === "number" ? payload.memberId : null;
      if (memberId) {
        const { data: profile } = await supabaseAdmin().from("profiles").select("id, name, color, role, active").eq("id", String(memberId)).eq("active", true).maybeSingle();
        if (profile) return { memberId: profile.id, name: profile.name, color: profile.color, canManage: profile.role === "manager" };
      }
    }

    const supabase = await supabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const { data: profile } = await supabase.from("profiles").select("id, name, color, role, active").eq("id", user.id).eq("active", true).maybeSingle();
    if (!profile) return null;
    return {
      memberId: profile.id,
      name: profile.name,
      color: profile.color,
      canManage: profile.role === "manager",
    };
  } catch {
    return null;
  }
}
