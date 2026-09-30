import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { isStripeConfigured, PLATFORM_FEE_RATE, REPEAT_PLATFORM_FEE_RATE } from "@/lib/stripe";
import SetupNotice from "@/components/SetupNotice";
import OnboardButton from "./OnboardButton";
import type { CraftsmanProfile } from "@/lib/types";

export const metadata = { title: "振込先の設定" };

export default async function PayoutsPage() {
  if (!isSupabaseConfigured()) return <SetupNotice />;

  const current = await getCurrentUser();
  if (!current?.profile) redirect("/login");
  if (current.profile.role !== "craftsman") redirect("/dashboard");

  const supabase = await createClient();
  // Own row incl. the private Stripe columns (Phase 32) — service role,
  // scoped to the signed-in craftsman.
  const { data: craftsmanProfile } = await adminClient()
    .from("craftsman_profiles")
    .select("*")
    .eq("profile_id", current.id)
    .maybeSingle<CraftsmanProfile>();

  const transfersEnabled = craftsmanProfile?.stripe_transfers_enabled ?? false;
  // Given at signup since the terms added 第5条's grant of authority to
  // collect payment; craftsmen registered before that give it here, before
  // Stripe onboarding (see startOnboarding).
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const agencyAgreed = Boolean(user?.user_metadata?.payment_agency_agreed_at);

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="text-xl font-bold">振込先の設定</h1>
      <p className="mt-2 text-sm text-ink-muted">
        依頼者からの支払いは、運営者があなたに代わって受け取り（利用規約第5条）、取引完了後に手数料（
        {Math.round(PLATFORM_FEE_RATE * 100)}%、同じ依頼者との2回目以降の取引は{" "}
        {Math.round(REPEAT_PLATFORM_FEE_RATE * 100)}%）を差し引いて、こちらで設定するStripe口座へ送金します。
      </p>

      {!isStripeConfigured() ? (
        <p className="mt-4 rounded-md bg-warn-soft px-3 py-2 text-sm text-warn">
          決済機能は準備中です（管理者がStripeを設定するまでお待ちください）。
        </p>
      ) : transfersEnabled ? (
        <div className="mt-4 rounded-md bg-good-soft px-3 py-2 text-sm text-good">
          振込先の設定が完了しています。取引完了後、自動的に送金されます。
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          <p className="text-sm">
            {craftsmanProfile?.stripe_account_id
              ? "Stripeでの本人確認・口座登録が完了していません。続きから再開してください。"
              : "報酬を受け取るには、Stripeで振込先の口座を登録する必要があります。"}
          </p>
          <OnboardButton
            label={craftsmanProfile?.stripe_account_id ? "設定を再開する" : "Stripeで振込先を設定する"}
            needsAgencyConsent={!agencyAgreed}
          />
        </div>
      )}
    </div>
  );
}
