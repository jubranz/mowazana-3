export function isDemoMode(): boolean {
  return process.env.MUWAZANA_DEMO_MODE === "true";
}

export function assertLiveConfiguration(): void {
  if (isDemoMode()) return;
  const required = [
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
  ];
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length) throw new Error(`Missing server configuration: ${missing.join(", ")}`);
}
