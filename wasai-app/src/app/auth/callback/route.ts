import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { SITE_URL } from "@/lib/site";

// Landing point for links Supabase emails out (password reset today; email
// confirmation too if "Confirm email" is ever turned back on) — exchanges
// the one-time code in the link for a real session, then hands off to
// whatever page actually needs that session (`next`).
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";

  if (code) {
    const supabase = await createClient();
    await supabase.auth.exchangeCodeForSession(code);
  }

  return NextResponse.redirect(`${SITE_URL}${next}`);
}
