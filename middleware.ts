import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    // sitemap.xml/robots.txt/icons/manifest/OGP images never care about auth
    // state, and the per-card opengraph-image route in particular gets hit
    // by social-media link-unfurling bots (X, LINE, Discord, Slack) on every
    // shared card link — skip the Supabase session-refresh round trip for
    // all of these rather than just the two originally covered.
    "/((?!_next/static|_next/image|favicon.ico|icon$|apple-icon$|manifest\\.webmanifest$|sitemap\\.xml|robots\\.txt|.*opengraph-image$|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
