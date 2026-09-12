import type { HoldingSummary } from "./types";

/**
 * Shared "current price might be unknown" valuation logic (added 2026-09-13
 * in response to Codex's independent review — see COORDINATION.md). Before
 * this, dashboardSummary.ts, PortfolioClient.tsx, cards/[id]/page.tsx, and
 * holdingsBreakdown.ts each independently did `card?.current_price ?? 0`
 * when computing a holding's current value. `cards.current_price` is a
 * nullable column (a card can exist in the catalog before its first price
 * scrape ever runs), and `?? 0` silently turns "we don't know the price"
 * into "confirmed worth ¥0" — which then reads as a 100%-loss 含み損益 on
 * that holding, a confidently wrong number, not an honest "can't tell yet."
 * A literal price of ¥0 (if that ever legitimately occurs) is NOT the same
 * thing and must still flow through as a real value — only null/undefined
 * means "unknown."
 *
 * Every call site that turns (holdings + current prices) into a currency
 * total now goes through this module so the "unknown, not zero" rule is
 * enforced in exactly one place. 実現損益 (realizedPnl, from computePnl) is
 * untouched by any of this — it depends only on historical buy/sell prices,
 * never on current_price, so it's always fully known.
 */

export interface PortfolioValuation {
  // Sum of quantity * current_price over ONLY the holdings whose card has a
  // known current_price — never includes a fabricated 0 for the rest.
  currentValue: number;
  // currentValue minus the cost basis of those SAME priced holdings (not
  // total cost basis across all holdings) — comparing an evaluated value
  // against the cost of things that couldn't be evaluated would make
  // unrealizedPnl look artificially worse by the full cost of each unpriced
  // holding, which is exactly the bug this module exists to avoid.
  unrealizedPnl: number;
  // How many distinct held cards have no known current_price (null, or the
  // card row itself wasn't found) — callers use this to show an honest
  // "N銘柄は現在価格未取得のため集計対象外です" caveat instead of presenting
  // currentValue/unrealizedPnl as if they covered the whole portfolio.
  unpricedHoldingsCount: number;
}

export function computePortfolioValuation(
  holdings: HoldingSummary[],
  currentPriceById: Map<string, number | null | undefined>
): PortfolioValuation {
  let currentValue = 0;
  let pricedCostBasis = 0;
  let unpricedHoldingsCount = 0;
  for (const h of holdings) {
    const price = currentPriceById.get(h.cardId);
    if (price == null) {
      unpricedHoldingsCount++;
    } else {
      currentValue += price * h.quantity;
      pricedCostBasis += h.costBasis;
    }
  }
  return {
    currentValue,
    unrealizedPnl: currentValue - pricedCostBasis,
    unpricedHoldingsCount,
  };
}

// Per-card evaluated value (used by per-row holdings lists, the card-detail
// "あなたの状況" panel, and holdingsBreakdown's per-group totals). Returns
// null — never 0 — when the price is unknown; callers must render that as
// "算出不可" or similar, never substitute a number.
export function cardHoldingValue(
  currentPrice: number | null | undefined,
  quantity: number
): number | null {
  return currentPrice == null ? null : currentPrice * quantity;
}
