import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isStripeConfigured, stripeClient } from "@/lib/stripe";
import { SITE_URL } from "@/lib/site";

// Stripe sends the browser here when an account link expired (unused for
// too long) before onboarding finished — generate a fresh link and bounce
// straight back to Stripe rather than stranding the craftsman on our side.
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

  if (!craftsmanProfile?.stripe_account_id) {
    return NextResponse.redirect(`${SITE_URL}/dashboard/payouts`);
  }

  const stripe = stripeClient();
  const accountLink = await stripe.accountLinks.create({
    account: craftsmanProfile.stripe_account_id,
    refresh_url: `${SITE_URL}/dashboard/payouts/refresh`,
    return_url: `${SITE_URL}/dashboard/payouts/return`,
    type: "account_onboarding",
  });

  return NextResponse.redirect(accountLink.url);
}
