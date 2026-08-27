import type { SessionPayload } from "./types";
import { supabaseServer } from "./supabase";
import { SignJWT } from "jose";

/** Legacy exports kept only so stale demo routes compile; production auth uses Supabase cookies. */
export const SESSION_COOKIE = "muwazana_session";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 30;
export async function createSessionToken(payload: SessionPayload): Promise<string> {
  return new SignJWT({ ...payload }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("30d").sign(new TextEncoder().encode(process.env.SESSION_SECRET ?? "legacy-disabled"));
}

export async function readSession(): Promise<SessionPayload | null> {
  try {
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
