import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);

export function isSixDigitPin(value: string): boolean {
  return /^\d{6}$/.test(value);
}

export async function hashPin(pin: string): Promise<string> {
  if (!isSixDigitPin(pin)) throw new Error("PIN must contain exactly six digits");
  const salt = randomBytes(16);
  const derived = await scrypt(pin, salt, 32) as Buffer;
  return `scrypt$${salt.toString("base64url")}$${derived.toString("base64url")}`;
}

export async function verifyPin(pin: string, stored: string | null | undefined): Promise<boolean> {
  if (!isSixDigitPin(pin) || !stored) return false;
  const [scheme, saltValue, hashValue] = stored.split("$");
  if (scheme !== "scrypt" || !saltValue || !hashValue) return false;
  const salt = Buffer.from(saltValue, "base64url");
  const expected = Buffer.from(hashValue, "base64url");
  const derived = await scrypt(pin, salt, expected.length) as Buffer;
  return derived.length === expected.length && timingSafeEqual(derived, expected);
}
