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

// Lower rate for a client/craftsman pair's 2nd+ completed order together
// (see src/lib/escrow.ts for how "repeat" is determined). Acquisition
// cost for this pair is already paid — undercutting a 0%-fee direct bank
// transfer isn't possible, but keeping the rate low is the platform's only
// lever against a trust-established pair simply moving off-platform for
// repeat business (the "マーケットプレイス・リーケージ" problem).
export const REPEAT_PLATFORM_FEE_RATE = 0.08;

export function platformFeeAmount(price: number, isRepeat: boolean = false): number {
  const rate = isRepeat ? REPEAT_PLATFORM_FEE_RATE : PLATFORM_FEE_RATE;
  return Math.round(price * rate);
}
