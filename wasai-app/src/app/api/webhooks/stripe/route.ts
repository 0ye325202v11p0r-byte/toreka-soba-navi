import { NextResponse, type NextRequest } from "next/server";
import type Stripe from "stripe";
import { adminClient } from "@/lib/supabase/admin";
import { isStripeConfigured, platformFeeAmount, stripeClient } from "@/lib/stripe";
import { notify } from "@/lib/notifications";
import { isRepeatCustomer } from "@/lib/escrow";

// Stripe → us only. Verified via the signing secret, not a session — this
// route intentionally uses the service-role client (bypasses RLS) because
// there is no logged-in user making the request.
export async function POST(request: NextRequest) {
  if (!isStripeConfigured()) {
    return new NextResponse("stripe not configured", { status: 503 });
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const signature = request.headers.get("stripe-signature");
  if (!webhookSecret || !signature) {
    return new NextResponse("missing signature", { status: 400 });
  }

  const rawBody = await request.text();
  const stripe = stripeClient();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch {
    return new NextResponse("invalid signature", { status: 400 });
  }

  const supabase = adminClient();

  // Shared by the two events that actually mean "money has landed": card
  // payments confirm synchronously via checkout.session.completed, but
  // delayed-notification methods (konbini, Japanese bank transfer) confirm
  // later via checkout.session.async_payment_succeeded instead — the
  // session's payment_status distinguishes the two at completion time (see
  // markPaidIfNeeded's caller below).
  async function markPaidIfNeeded(session: Stripe.Checkout.Session) {
    const orderId = session.client_reference_id ?? session.metadata?.order_id ?? null;
    if (!orderId) return;

    const paymentIntentId =
      typeof session.payment_intent === "string" ? session.payment_intent : (session.payment_intent?.id ?? null);

    // Only advance orders still awaiting payment — guards against a
    // duplicate webhook delivery (Stripe retries on anything but a 2xx)
    // re-running this after the order has already moved on.
    const { data: updated } = await supabase
      .from("orders")
      .update({
        status: "in_progress",
        payment_status: "paid",
        stripe_payment_intent_id: paymentIntentId,
      })
      .eq("id", orderId)
      .eq("status", "pending_payment")
      .select("client_id, craftsman_id, title, price")
      .maybeSingle();

    if (updated) {
      // Lock in the platform's cut the moment money actually changes hands,
      // not at completion — otherwise changing PLATFORM_FEE_RATE /
      // REPEAT_PLATFORM_FEE_RATE while this order is still in_progress would
      // silently change the craftsman's payout at releaseEscrowPayout() time,
      // despite the order page having shown a fee figure since payment.
      const isRepeat = await isRepeatCustomer(supabase, updated.client_id, updated.craftsman_id, orderId);
      const fee = platformFeeAmount(updated.price, isRepeat);
      await supabase.from("orders").update({ platform_fee_amount: fee }).eq("id", orderId);

      await notify(supabase, {
        userId: updated.craftsman_id,
        type: "payment_received",
        title: "支払いが完了しました",
        body: `${updated.title} — 作業を開始できます。`,
        link: `/orders/${orderId}`,
      });
    }
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      // For card payments (synchronous), payment_status is already "paid"
      // here. For konbini/bank transfer (delayed notification), the
      // customer has only chosen the method — payment_status is "unpaid"
      // until checkout.session.async_payment_succeeded confirms the money
      // actually arrived. Marking the order paid here regardless would let
      // a craftsman start work — and could trigger the eventual payout —
      // before the client has actually paid anything.
      if (session.payment_status === "paid") {
        await markPaidIfNeeded(session);
      }
      break;
    }

    case "checkout.session.async_payment_succeeded": {
      const session = event.data.object as Stripe.Checkout.Session;
      await markPaidIfNeeded(session);
      break;
    }

    case "checkout.session.async_payment_failed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const orderId = session.client_reference_id ?? session.metadata?.order_id ?? null;
      if (orderId) {
        // The order was never marked paid (see checkout.session.completed
        // above), so it's already sitting in pending_payment with nothing
        // to undo — just let the client know their konbini/bank-transfer
        // payment didn't come through so they can retry (existing
        // PaymentRetryButton re-creates a Checkout session for any
        // pending_payment order).
        const { data: order } = await supabase
          .from("orders")
          .select("client_id, title")
          .eq("id", orderId)
          .eq("status", "pending_payment")
          .maybeSingle();
        if (order) {
          await notify(supabase, {
            userId: order.client_id,
            type: "payment_failed",
            title: "お支払いが完了しませんでした",
            body: `${order.title} — 期限切れまたは失敗のため、再度お支払い手続きをお願いします。`,
            link: `/orders/${orderId}`,
          });
        }
      }
      break;
    }

    case "account.updated": {
      const account = event.data.object as Stripe.Account;
      const transfersEnabled = account.capabilities?.transfers === "active";
      await supabase
        .from("craftsman_profiles")
        .update({ stripe_transfers_enabled: transfersEnabled })
        .eq("stripe_account_id", account.id);
      break;
    }

    default:
      break;
  }

  return NextResponse.json({ received: true });
}
