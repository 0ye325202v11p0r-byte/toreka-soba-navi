/**
 * "あなたのポートフォリオ vs 市場平均" — added 2026-09-13 as a genuine
 * differentiation feature: a raw price-checking site (or a competitor that
 * just re-scrapes the same shop) can show a single card's price, but only
 * an app that already tracks BOTH this user's specific holdings AND the
 * whole catalog's price movement can answer "is MY collection doing better
 * or worse than the market as a whole." That comparison is the actual
 * analytical value this project can defend — it depends on two datasets
 * this app already owns, not on the underlying price data being exclusive.
 *
 * Kept framework-free and pure, like dashboardSummary.ts/portfolioValuation.ts,
 * so the two numbers being compared are independently testable.
 */
import type { HoldingSummary } from "./types";

export interface MarketBenchmarkResult {
  // Value-weighted average pct_vs_avg30 across the user's currently-held,
  // auto-tracked cards — weighting by current position value (not an
  // unweighted average across cards) so a holding that's 90% of the
  // portfolio's value dominates the number the way it dominates the user's
  // actual outcome, matching how currentValue/unrealizedPnl already work
  // elsewhere (see portfolioValuation.ts).
  portfolioAvgPct: number | null;
  // Simple (unweighted) average pct_vs_avg30 across every 'real' data_quality
  // card in the catalog — "the market as a whole," not just cards this user
  // happens to hold. Unweighted deliberately: there is no notion of "this
  // user's position size" for cards they don't hold, so a per-card average
  // is the only meaningful baseline.
  marketAvgPct: number | null;
  // How many of the user's held cards couldn't contribute to portfolioAvgPct
  // (no known current_price for weighting, or not auto-tracked so no
  // pct_vs_avg30 exists) — callers must disclose this rather than silently
  // comparing a partial number as if it covered the whole portfolio.
  excludedHoldingsCount: number;
}

export function computeMarketBenchmark(
  holdings: HoldingSummary[],
  cardById: Map<string, { current_price: number | null; pct_vs_avg30: number | null }>,
  catalogPctValues: number[]
): MarketBenchmarkResult {
  let weightedPctSum = 0;
  let totalWeight = 0;
  let excludedHoldingsCount = 0;
  for (const h of holdings) {
    const card = cardById.get(h.cardId);
    const price = card?.current_price;
    const pct = card?.pct_vs_avg30;
    if (price == null || pct == null) {
      excludedHoldingsCount++;
      continue;
    }
    const weight = price * h.quantity;
    weightedPctSum += pct * weight;
    totalWeight += weight;
  }
  // totalWeight > 0 (not !== 0) also correctly returns null for the
  // vanishingly rare case where every contributing holding has a genuine
  // ¥0 current_price — a weighted average is mathematically undefined
  // with zero total weight, so null ("nothing to compute") is the honest
  // answer, not a divide-by-zero NaN.
  const portfolioAvgPct = totalWeight > 0 ? weightedPctSum / totalWeight : null;

  const marketAvgPct =
    catalogPctValues.length > 0
      ? catalogPctValues.reduce((sum, v) => sum + v, 0) / catalogPctValues.length
      : null;

  return { portfolioAvgPct, marketAvgPct, excludedHoldingsCount };
}
