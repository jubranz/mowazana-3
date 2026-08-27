import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

export async function GET(request: NextRequest) {
  const url = new URL("/", request.url);
  const code = request.nextUrl.searchParams.get("code");
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!code || !supabaseUrl || !key) { url.searchParams.set("auth", "failed"); return NextResponse.redirect(url); }
  const response = NextResponse.redirect(url);
  const supabase = createServerClient(supabaseUrl, key, { cookies: { getAll: () => request.cookies.getAll(), setAll: (items) => items.forEach(({ name, value, options }) => response.cookies.set(name, value, options)) } });
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) url.searchParams.set("auth", "failed");
  return error ? NextResponse.redirect(url) : response;
}
