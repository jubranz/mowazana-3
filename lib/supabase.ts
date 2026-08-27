import "server-only";

import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

function config() {
  const url = process.env.INTERNAL_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.INTERNAL_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Supabase is not configured");
  return { url, key };
}

export async function supabaseServer() {
  const { url, key } = config();
  const store = await cookies();
  return createServerClient(url, key, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (items) => { try { items.forEach(({ name, value, options }) => store.set(name, value, options)); } catch { /* Route handlers refresh cookies themselves. */ } },
    },
  });
}

export function supabaseAdmin() {
  const { url } = config();
  const key = process.env.PRIVATE_SUPABASE_SERVICE_ROLE_KEY || process.env.INTERNAL_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}
