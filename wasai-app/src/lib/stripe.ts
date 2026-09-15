import Stripe from "stripe";

export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

// Server-only. Never import from client components.
export function stripeClient(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
  return new Stripe(key);
}

// Platform commission. 15% mirrors what a intermediary (教室/問屋) would
// otherwise take — see the "who actually profits in this industry"
// discussion this project started from — but transparently, at a fixed
// rate shown to both sides, instead of an opaque markup.
export const PLATFORM_FEE_RATE = 0.15;

export function platformFeeAmount(price: number): number {
  return Math.round(price * PLATFORM_FEE_RATE);
}
