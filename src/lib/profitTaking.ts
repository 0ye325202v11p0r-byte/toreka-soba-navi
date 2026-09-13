import { cardHoldingValue } from "./portfolioValuation";
import type { HoldingSummary } from "./types";

/**
 * "利益確定を検討してもよいかもしれないカード" — added 2026-09-13,
 * differentiation feature #4. Combines two datasets no plain price-checking
 * site has together: this user's own cost basis (from their recorded
 * transactions) and the card's own market judgment (割高/適正/割安, from
 * this app's daily-tracked 30-day average). A card can only be a genuine
 * profit-taking candidate when BOTH hold: the user is actually sitting on
 * a real unrealized gain (their own avgCost, not just "the market is up"),
 * AND the market itself currently reads the price as overextended relative
 * to its own recent average (judgment === '割高') — either signal alone is
 * not enough (a gain with no overextension is just... a gain; an
 * overextended card the user bought even higher than today's price would
 * be a candidate for CUTTING a loss, not taking profit, a different and
 * NOT what this feature claims to identify).
 *
 * This is a decision-support signal, not investment advice — the caller-
 * facing text must make that explicit, the same way taxReport.ts's output
 * is a computational aid, not a tax judgment.
 */
export interface ProfitTakingCandidate {
  cardId: string;
  cardName: string;
  unrealizedGain: number;
  gainPct: number; // (value - costBasis) / costBasis * 100
}

interface ProfitTakingCardInfo {
  name: string;
  current_price: number | null;
  judgment: string | null;
}

export function findProfitTakingCandidates(
  holdings: HoldingSummary[],
  cardById: Map<string, ProfitTakingCardInfo>
): ProfitTakingCandidate[] {
  const candidates: ProfitTakingCandidate[] = [];
  for (const h of holdings) {
    const card = cardById.get(h.cardId);
    if (!card || card.judgment !== "割高") continue;
    const value = cardHoldingValue(card.current_price, h.quantity);
    if (value === null) continue;
    const unrealizedGain = value - h.costBasis;
    // costBasis > 0 is guaranteed for any real holding (quantity > 0 and
    // price_per_unit >= 0 with at least one buy to exist at all), but
    // guarded explicitly rather than assumed, to avoid a divide-by-zero
    // producing Infinity/NaN for some future degenerate input.
    if (unrealizedGain <= 0 || h.costBasis <= 0) continue;
    candidates.push({
      cardId: h.cardId,
      cardName: card.name,
      unrealizedGain,
      gainPct: (unrealizedGain / h.costBasis) * 100,
    });
  }
  return candidates.sort((a, b) => b.gainPct - a.gainPct);
}
