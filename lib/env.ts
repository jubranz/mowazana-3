export function isDemoMode(): boolean {
  if (process.env.MUWAZANA_DEMO_MODE === "true") return true;
  const missingWordPress = !process.env.WORDPRESS_BASE_URL || !process.env.WORDPRESS_APP_PASSWORD;
  return missingWordPress && (process.env.NODE_ENV === "development" || process.env.VERCEL_ENV === "preview");
}

export function assertLiveConfiguration(): void {
  if (isDemoMode()) return;
  const required = [
    "WORDPRESS_BASE_URL",
    "WORDPRESS_APP_USERNAME",
    "WORDPRESS_APP_PASSWORD",
    "SESSION_SECRET",
  ];
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length) throw new Error(`Missing server configuration: ${missing.join(", ")}`);
}

export function getSessionSecret(): Uint8Array {
  const value = process.env.SESSION_SECRET;
  if (value) return new TextEncoder().encode(value);
  if (isDemoMode()) return new TextEncoder().encode("preview-only-muwazana-session-secret-change-me");
  throw new Error("SESSION_SECRET is required");
}
