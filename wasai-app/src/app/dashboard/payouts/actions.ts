"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { isStripeConfigured, stripeClient } from "@/lib/stripe";
import { SITE_URL } from "@/lib/site";

export interface OnboardingState {
  error?: string;
}

export async function startOnboarding(_prevState: OnboardingState, formData: FormData): Promise<OnboardingState> {
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

  // Craftsmen who signed up before the terms gained 第5条's grant of
  // authority to collect payment haven't given it yet — take it here, before
  // they can be paid out (signup records it for everyone newer).
  if (!user.user_metadata?.payment_agency_agreed_at) {
    if (formData.get("agree_payment_agency") !== "yes") {
      return { error: "振込先を設定するには、代金の受け取りに関する同意（利用規約第5条）が必要です。" };
    }
    const { error: consentError } = await supabase.auth.updateUser({
      data: { payment_agency_agreed_at: new Date().toISOString() },
    });
    if (consentError) {
      return { error: "同意の記録に失敗しました。時間をおいて再度お試しください。" };
    }
  }

  // The Stripe columns are service-role only (Phase 32): not readable or
  // writable through the craftsman's own client.
  const admin = adminClient();
  const { data: craftsmanProfile } = await admin
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
        // Prefilled so the craftsman isn't asked for an industry, a website
        // (most don't have one) and a business description on Stripe's
        // onboarding screen — every craftsman here does the same kind of
        // work, and their public profile page on this site serves as the
        // "website" Stripe uses to see what they sell.
        business_profile: {
          mcc: "5697", // Tailors, Seamstresses, Mending, and Alterations
          url: `${SITE_URL}/craftsmen/${user.id}`,
          product_description:
            "着物の仕立て・お直しを請け負っています。依頼は和裁マッチを通じて受け、代金も和裁マッチ経由で受け取ります。",
        },
      });
      accountId = account.id;

      const { error: saveError } = await admin
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
