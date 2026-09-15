import { createClient } from "@supabase/supabase-js";

// Server-only client with the service_role key (bypasses RLS). Only used by
// the Stripe webhook route, which has no user session to authenticate as —
// it verifies the request came from Stripe via the webhook signature
// instead, then writes the payment result directly.
export function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}
