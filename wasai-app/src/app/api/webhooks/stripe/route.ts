import { NextResponse, type NextRequest } from "next/server";
import type Stripe from "stripe";
import { adminClient } from "@/lib/supabase/admin";
import { isStripeConfigured, stripeClient } from "@/lib/stripe";

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

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const orderId = session.client_reference_id ?? session.metadata?.order_id ?? null;
      if (orderId) {
        const paymentIntentId =
          typeof session.payment_intent === "string"
            ? session.payment_intent
            : (session.payment_intent?.id ?? null);

        // Only advance orders still awaiting payment — guards against a
        // duplicate webhook delivery (Stripe retries on anything but a 2xx)
        // re-running this after the order has already moved on.
        await supabase
          .from("orders")
          .update({
            status: "in_progress",
            payment_status: "paid",
            stripe_payment_intent_id: paymentIntentId,
          })
          .eq("id", orderId)
          .eq("status", "pending_payment");
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
