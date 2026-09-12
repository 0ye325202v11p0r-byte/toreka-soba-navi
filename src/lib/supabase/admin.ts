import { createClient } from "@supabase/supabase-js";

// Server-only client with the service_role key (bypasses RLS). Never
// import this from client code or from anything that runs in the
// browser — it must only run in cron route handlers. Extracted 2026-09-12
// from three identical copies (refresh-prices, check-watchlist,
// refresh-yuyutei-prices route handlers) into this shared module,
// alongside the existing per-context pattern in src/lib/supabase/
// (client.ts for the browser, server.ts for cookie-based request
// contexts) — this is the third context, the one with no user session at
// all.
export function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}
