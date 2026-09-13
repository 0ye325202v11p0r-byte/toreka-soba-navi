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

/**
 * "分散度" (diversification/concentration) check — added 2026-09-13 as a
 * differentiation feature in the same spirit as marketBenchmark.ts: a plain
 * price-checking site has no notion of "your portfolio," so it can never
 * tell a user their holdings are concentrated in one product line. This
 * app already computes the grouped values for the breakdown panel; this is
 * just one more honest read of numbers it already has.
 *
 * Computed from `value` alone (never a fabricated total including unknown
 * contributions) — a group's hasUnknownValue doesn't change how its KNOWN
 * value counts toward concentration, it just means the true share could be
 * somewhat different from what's shown; no separate caveat is layered on
 * top here since the breakdown panel already discloses that per group.
 */
export interface ConcentrationInfo {
  topLabel: string;
  topSharePct: number; // 0-100, rounded to 1 decimal
  isConcentrated: boolean;
}

// A round, easily-explained threshold: "half or more of your holdings'
// value sits in a single set" is a concrete, defensible bar for a warning
// — not tuned against any real usage data (there is none yet).
const CONCENTRATION_THRESHOLD_PCT = 50;

export function computeConcentration(groups: BreakdownGroup[]): ConcentrationInfo | null {
  if (groups.length === 0) return null;
  const totalValue = groups.reduce((sum, g) => sum + g.value, 0);
  if (totalValue <= 0) return null; // nothing known to compute a share of — see cardHoldingValue's "unknown, not zero"
  // groups is already sorted descending by value (see groupBy above), so
  // the first entry is always the largest — re-deriving the max here
  // instead of trusting incoming order would just be redundant work, but
  // relying on undocumented caller behavior is fragile, so this is spelled
  // out rather than silently assumed.
  const top = [...groups].sort((a, b) => b.value - a.value)[0];
  const topSharePct = Math.round((top.value / totalValue) * 1000) / 10;
  return { topLabel: top.label, topSharePct, isConcentrated: topSharePct >= CONCENTRATION_THRESHOLD_PCT };
}
