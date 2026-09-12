import { cardHoldingValue } from "./portfolioValuation";
import type { HoldingSummary } from "./types";

/**
 * Pure aggregation for "保有カードの構成内訳" (portfolio composition by
 * rarity / set) — roadmap item held over from the 2026-09-13 dashboard
 * priority discussion (see COORDINATION.md, "残り項目6〜10の提案"). Takes
 * the already-computed FIFO holdings (from computePnl) and the card
 * metadata needed to group them, so it stays as framework-free and
 * independently testable as pnl.ts/dashboardSummary.ts.
 */
export interface BreakdownGroup {
  label: string;
  cardCount: number; // distinct cards in this group
  quantity: number; // total held quantity in this group
  // Sum of quantity * current_price over ONLY the cards in this group with a
  // known current_price — see portfolioValuation.ts. Never a fabricated 0
  // for the rest; check hasUnknownValue to know whether this is partial.
  value: number;
  // True if at least one card in this group has no known current_price
  // (null, or the card row wasn't found) — Codex independent review,
  // 2026-09-13: `value` alone would otherwise look like a complete,
  // confident total even when it silently excludes such cards.
  hasUnknownValue: boolean;
}

export interface HoldingsBreakdown {
  byRarity: BreakdownGroup[];
  bySet: BreakdownGroup[];
}

interface BreakdownCardInfo {
  id: string;
  rarity: string;
  set_name: string | null;
  current_price: number | null;
}

function groupBy(
  holdings: HoldingSummary[],
  cardById: Map<string, BreakdownCardInfo>,
  keyOf: (card: BreakdownCardInfo) => string
): BreakdownGroup[] {
  const groups = new Map<string, BreakdownGroup>();
  for (const h of holdings) {
    const card = cardById.get(h.cardId);
    // A holding whose card row wasn't fetched (e.g. deleted after purchase)
    // is still real money the user holds — group it under an explicit
    // fallback rather than silently dropping it from the total.
    const key = card ? keyOf(card) : "不明";
    const value = cardHoldingValue(card?.current_price, h.quantity);
    const existing =
      groups.get(key) ?? { label: key, cardCount: 0, quantity: 0, value: 0, hasUnknownValue: false };
    existing.cardCount += 1;
    existing.quantity += h.quantity;
    if (value === null) {
      existing.hasUnknownValue = true;
    } else {
      existing.value += value;
    }
    groups.set(key, existing);
  }
  return [...groups.values()].sort((a, b) => b.value - a.value);
}

export function buildHoldingsBreakdown(
  holdings: HoldingSummary[],
  cards: BreakdownCardInfo[]
): HoldingsBreakdown {
  const cardById = new Map(cards.map((c) => [c.id, c]));
  return {
    byRarity: groupBy(holdings, cardById, (c) => c.rarity),
    bySet: groupBy(holdings, cardById, (c) => c.set_name ?? "弾不明"),
  };
}
