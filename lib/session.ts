import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { getSessionSecret } from "./env";
import type { SessionPayload } from "./types";

export const SESSION_COOKIE = "muwazana_session";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 30;

export async function createSessionToken(payload: SessionPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .setIssuer("muwazana")
    .setAudience("muwazana-member")
    .sign(getSessionSecret());
}

export async function readSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSessionSecret(), {
      issuer: "muwazana",
      audience: "muwazana-member",
    });
    if (typeof payload.memberId !== "number" || typeof payload.name !== "string") return null;
    return {
      memberId: payload.memberId,
      name: payload.name,
      color: typeof payload.color === "string" ? payload.color : "#4f8f78",
      canManage: payload.canManage === true,
    };
  } catch {
    return null;
  }
}
