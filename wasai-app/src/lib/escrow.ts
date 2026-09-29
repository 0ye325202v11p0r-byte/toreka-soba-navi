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
// Must be given the service-role client: payment_status is writable only by
// service role (Phase 29 in supabase/schema.sql).
// Best-effort: if the craftsman hasn't finished Stripe onboarding yet, this
// leaves payment_status at "paid" instead of blocking completion — there's
// nothing the client (or the cron) can do about the craftsman's account
// setup. releasePendingPayouts() below picks it up once they have.
export async function releaseEscrowPayout(
  supabase: SupabaseClient,
  order: {
    id: string;
    client_id: string;
    craftsman_id: string;
    price: number;
    payment_status: string;
    stripe_payment_intent_id: string | null;
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

  // Tie the transfer to the order's own charge. Without source_transaction a
  // transfer draws on the platform's *available* balance, so completing an
  // order before its payment has settled (Stripe holds new charges for a
  // few days) fails outright; with it, Stripe accepts the transfer now and
  // moves the money once that charge's funds become available.
  let sourceTransaction: string | undefined;
  if (order.stripe_payment_intent_id) {
    const paymentIntent = await stripe.paymentIntents.retrieve(order.stripe_payment_intent_id);
    const charge = paymentIntent.latest_charge;
    sourceTransaction = typeof charge === "string" ? charge : (charge?.id ?? undefined);
  }

  // A transfer for this order may already exist even though payment_status
  // still says "paid" (the transfer succeeded but recording it here didn't).
  // Check Stripe first so a retry can never pay the craftsman twice.
  const existing = await stripe.transfers.list({ transfer_group: order.id, limit: 1 });
  const transfer =
    existing.data[0] ??
    (await stripe.transfers.create(
      {
        amount: transferAmount,
        currency: "jpy",
        destination: craftsmanProfile.stripe_account_id,
        transfer_group: order.id,
        ...(sourceTransaction ? { source_transaction: sourceTransaction } : {}),
      },
      // Dedupes concurrent calls (the webhook and the onboarding return page
      // both releasing pending payouts at once). Scoped to the current hour
      // because Stripe replays a failed request's error for 24h under the
      // same key — a payout rejected while the craftsman's transfers
      // capability was still activating would otherwise stay stuck for a day
      // (seen in production). Retries in a later hour get a real new attempt;
      // the list() check above covers the cross-hour case.
      { idempotencyKey: `escrow-transfer-${order.id}-${new Date().toISOString().slice(0, 13)}` }
    ));

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
  await stripe.refunds.create(
    { payment_intent: order.stripe_payment_intent_id },
    { idempotencyKey: `escrow-refund-${order.id}` }
  );

  await supabase.from("orders").update({ payment_status: "refunded" }).eq("id", order.id);
}

// Completed orders whose payout couldn't go out at completion time — the
// craftsman hadn't finished Stripe onboarding yet, or the transfer call
// failed — are left at payment_status "paid". Called when a craftsman's
// transfers capability turns on (onboarding return page, account.updated
// webhook) and by the daily cron as a sweep, so no payout stays stuck.
// Pass craftsmanId to limit it to one craftsman. Service-role client only.
export async function releasePendingPayouts(supabase: SupabaseClient, craftsmanId?: string) {
  if (!isStripeConfigured()) return;

  let query = supabase
    .from("orders")
    .select("id, client_id, craftsman_id, price, payment_status, stripe_payment_intent_id, platform_fee_amount")
    .eq("status", "completed")
    .eq("payment_status", "paid");
  if (craftsmanId) query = query.eq("craftsman_id", craftsmanId);

  const { data: orders } = await query;
  for (const order of orders ?? []) {
    try {
      await releaseEscrowPayout(supabase, order);
    } catch (error) {
      // One failing transfer shouldn't block the rest; it stays "paid" and
      // the next sweep tries again.
      console.error(`payout retry failed for order ${order.id}`, error);
    }
  }
}
