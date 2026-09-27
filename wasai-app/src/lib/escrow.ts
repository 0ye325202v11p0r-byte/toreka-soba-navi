import type { SupabaseClient } from "@supabase/supabase-js";
import { isStripeConfigured, platformFeeAmount, stripeClient } from "@/lib/stripe";

// "Repeat" = this client/craftsman pair has at least one OTHER completed
// order together already — see REPEAT_PLATFORM_FEE_RATE in stripe.ts.
export async function isRepeatCustomer(
  supabase: SupabaseClient,
  clientId: string,
  craftsmanId: string,
  excludeOrderId: string
): Promise<boolean> {
  const { count } = await supabase
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("client_id", clientId)
    .eq("craftsman_id", craftsmanId)
    .eq("status", "completed")
    .neq("id", excludeOrderId);
  return (count ?? 0) > 0;
}

// Shared by the client's "completed" action (src/app/orders/[id]/actions.ts)
// and the auto-complete cron (src/app/api/cron/auto-complete-orders/route.ts)
// — the one place funds actually leave the platform's Stripe account, via a
// separate Transfer rather than a destination charge (see src/lib/stripe.ts).
// Best-effort: if the craftsman hasn't finished Stripe onboarding yet, this
// silently leaves payment_status at "paid" instead of blocking completion —
// there's nothing the client (or the cron) can do about the craftsman's
// account setup, and the payout can be retried later (not yet automated).
export async function releaseEscrowPayout(
  supabase: SupabaseClient,
  order: {
    id: string;
    client_id: string;
    craftsman_id: string;
    price: number;
    payment_status: string;
    platform_fee_amount?: number | null;
  }
) {
  if (!isStripeConfigured() || order.payment_status !== "paid") return;

  const { data: craftsmanProfile } = await supabase
    .from("craftsman_profiles")
    .select("stripe_account_id, stripe_transfers_enabled")
    .eq("profile_id", order.craftsman_id)
    .maybeSingle();

  if (!craftsmanProfile?.stripe_account_id || !craftsmanProfile.stripe_transfers_enabled) return;

  // Prefer the fee already locked in when the order was marked paid (see the
  // Stripe webhook) over recomputing it here — otherwise a platform fee-rate
  // change made while this order sat in_progress would silently change how
  // much the craftsman gets, despite the order page having shown them a
  // fee figure since the moment they got paid. Falls back to a live
  // computation only for orders paid before this locking existed.
  const fee =
    order.platform_fee_amount ??
    platformFeeAmount(order.price, await isRepeatCustomer(supabase, order.client_id, order.craftsman_id, order.id));
  const transferAmount = order.price - fee;
  if (transferAmount <= 0) return;

  const stripe = stripeClient();
  const transfer = await stripe.transfers.create({
    amount: transferAmount,
    currency: "jpy",
    destination: craftsmanProfile.stripe_account_id,
    transfer_group: order.id,
  });

  await supabase
    .from("orders")
    .update({
      payment_status: "transferred",
      stripe_transfer_id: transfer.id,
      platform_fee_amount: fee,
    })
    .eq("id", order.id);
}

// A cancelled order can only ever be in payment_status "unpaid" or "paid" —
// "transferred" is only reachable via releaseEscrowPayout() above, which
// only runs on the "completed" transition, and no code path cancels an
// already-completed order. So there's no case here where the craftsman has
// already been paid out.
export async function refundIfPaid(
  supabase: SupabaseClient,
  order: { id: string; payment_status: string; stripe_payment_intent_id: string | null }
) {
  if (!isStripeConfigured() || order.payment_status !== "paid" || !order.stripe_payment_intent_id) return;

  const stripe = stripeClient();
  await stripe.refunds.create({ payment_intent: order.stripe_payment_intent_id });

  await supabase.from("orders").update({ payment_status: "refunded" }).eq("id", order.id);
}
