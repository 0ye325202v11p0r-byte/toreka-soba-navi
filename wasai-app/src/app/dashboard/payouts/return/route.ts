import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isStripeConfigured, stripeClient } from "@/lib/stripe";
import { SITE_URL } from "@/lib/site";
import { adminClient } from "@/lib/supabase/admin";
import { releasePendingPayouts } from "@/lib/escrow";

// Stripe redirects the craftsman's browser here after they finish (or
// abandon) the Express onboarding flow. We don't trust that "finish" means
// "verified" — re-fetch the account from Stripe to see what's actually
// enabled before updating our own record.
export async function GET() {
  if (!isStripeConfigured()) {
    return NextResponse.redirect(`${SITE_URL}/dashboard/payouts`);
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(`${SITE_URL}/login`);

  const { data: craftsmanProfile } = await supabase
    .from("craftsman_profiles")
    .select("stripe_account_id")
    .eq("profile_id", user.id)
    .maybeSingle();

  if (craftsmanProfile?.stripe_account_id) {
    const stripe = stripeClient();
    const account = await stripe.accounts.retrieve(craftsmanProfile.stripe_account_id);
    const transfersEnabled = account.capabilities?.transfers === "active";

    await supabase
      .from("craftsman_profiles")
      .update({ stripe_transfers_enabled: transfersEnabled })
      .eq("profile_id", user.id);

    // Pay out anything the craftsman completed before finishing onboarding.
    if (transfersEnabled) {
      await releasePendingPayouts(adminClient(), user.id);
    }
  }

  return NextResponse.redirect(`${SITE_URL}/dashboard/payouts`);
}
