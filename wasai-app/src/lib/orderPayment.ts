import type { SupabaseClient } from "@supabase/supabase-js";
import { stripeClient } from "@/lib/stripe";
import { SITE_URL } from "@/lib/site";

// Shared by every entry point that turns a freshly-created (pending_payment)
// order into a Stripe Checkout redirect: a direct service purchase, an
// accepted proposal, and the "retry payment" button on the order page
// itself. Charges the platform's own Stripe account (not a destination
// charge) — see src/lib/stripe.ts for why: funds are held until the order
// is marked completed, then moved to the craftsman via a separate Transfer.
export async function createCheckoutSessionUrl(
  supabase: SupabaseClient,
  order: { id: string; title: string; price: number }
): Promise<string> {
  const stripe = stripeClient();

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: [
      {
        price_data: {
          currency: "jpy",
          product_data: { name: order.title },
          // JPY has no minor unit in Stripe — unit_amount is the yen amount
          // itself, not cents.
          unit_amount: order.price,
        },
        quantity: 1,
      },
    ],
    client_reference_id: order.id,
    metadata: { order_id: order.id },
    success_url: `${SITE_URL}/orders/${order.id}?checkout=success`,
    cancel_url: `${SITE_URL}/orders/${order.id}?checkout=cancelled`,
  });

  if (!session.url) {
    throw new Error("Stripe Checkoutセッションの作成に失敗しました。");
  }

  await supabase
    .from("orders")
    .update({ stripe_checkout_session_id: session.id })
    .eq("id", order.id);

  return session.url;
}
