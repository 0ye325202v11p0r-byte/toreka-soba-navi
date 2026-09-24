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

// Platform commission. Benchmarked against comparable commission-based
// marketplaces (ココナラ 22%, ランサーズ 16.5% flat, クラウドワークス
// 20%/10%/5% by contract size, as of 2026-09) — 18% sits below all three
// while still capturing more than the original 15%, which undercut every
// competitor without a clear reason to.
export const PLATFORM_FEE_RATE = 0.18;

// Lower rate for a client/craftsman pair's 2nd+ completed order together
// (see src/lib/escrow.ts for how "repeat" is determined). Acquisition
// cost for this pair is already paid — undercutting a 0%-fee direct bank
// transfer isn't possible, but keeping the rate low is the platform's only
// lever against a trust-established pair simply moving off-platform for
// repeat business (the "マーケットプレイス・リーケージ" problem). None of
// the competitors above offer a repeat discount at all, so 12% still reads
// as a clear reason to stay on-platform without needing to match the
// original 8%, which gave up more margin than the leakage risk required.
export const REPEAT_PLATFORM_FEE_RATE = 0.12;

export function platformFeeAmount(price: number, isRepeat: boolean = false): number {
  const rate = isRepeat ? REPEAT_PLATFORM_FEE_RATE : PLATFORM_FEE_RATE;
  return Math.round(price * rate);
}
