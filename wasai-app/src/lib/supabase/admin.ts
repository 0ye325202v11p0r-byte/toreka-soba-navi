import { createClient } from "@supabase/supabase-js";

// Server-only client with the service_role key (bypasses RLS). Used by the
// Stripe webhook route (no user session to authenticate as — it verifies
// the request came from Stripe via the webhook signature instead) and by
// admin pages/actions that must act across every user's data regardless of
// RLS ownership (setting grade_verified, signing another craftsman's
// private certificate file for the verification page).
export function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}
