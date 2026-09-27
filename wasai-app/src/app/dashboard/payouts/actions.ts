"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isStripeConfigured, stripeClient } from "@/lib/stripe";
import { SITE_URL } from "@/lib/site";

export interface OnboardingState {
  error?: string;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- useActionState requires this signature; the action needs neither argument
export async function startOnboarding(_prevState: OnboardingState, _formData: FormData): Promise<OnboardingState> {
  if (!isStripeConfigured()) {
    return { error: "Stripeが未設定です（管理者に連絡してください）。" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "ログインが必要です。" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (profile?.role !== "craftsman") {
    return { error: "和裁士アカウントのみ振込先の設定ができます。" };
  }

  const { data: craftsmanProfile } = await supabase
    .from("craftsman_profiles")
    .select("stripe_account_id")
    .eq("profile_id", user.id)
    .maybeSingle();

  const stripe = stripeClient();
  let accountId = craftsmanProfile?.stripe_account_id ?? null;

  // Stripe errors (account setup not allowed, network, ...) would otherwise
  // surface as a bare "This page couldn't load" screen — log the real
  // reason for Vercel's logs and show the craftsman something readable.
  let onboardingUrl: string;
  try {
    if (!accountId) {
      const account = await stripe.accounts.create({
        type: "express",
        country: "JP",
        email: user.email,
        capabilities: {
          transfers: { requested: true },
        },
        business_type: "individual",
      });
      accountId = account.id;

      const { error: saveError } = await supabase
        .from("craftsman_profiles")
        .update({ stripe_account_id: accountId })
        .eq("profile_id", user.id);
      if (saveError) return { error: saveError.message };
    }

    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${SITE_URL}/dashboard/payouts/refresh`,
      return_url: `${SITE_URL}/dashboard/payouts/return`,
      type: "account_onboarding",
    });
    onboardingUrl = accountLink.url;
  } catch (error) {
    console.error("Stripe onboarding failed", error);
    return {
      error: "振込先の設定画面を開けませんでした。時間をおいて再度お試しください。解決しない場合は運営までお問い合わせください。",
    };
  }

  redirect(onboardingUrl);
}
