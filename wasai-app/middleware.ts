import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    // /api/webhooks/* and /api/cron/* carry no Supabase session cookie
    // (Stripe and Vercel Cron call them server-to-server) — skip the
    // pointless session-refresh round trip.
    "/((?!_next/static|_next/image|favicon.ico|api/webhooks|api/cron|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
