import { computePnl } from "./pnl";
import { conditionMet } from "./watchlistRule";
import { isAutoTracked } from "./format";
import type { Transaction, WatchlistItem, DashboardCardInfo } from "./types";

/**
 * Pure aggregation for the personal dashboard (added 2026-09-13, in
 * response to the user's request to make the app worth reopening weekly —
 * see COORDINATION.md's design discussion). Kept framework-free, like
 * pnl.ts/watchlistRule.ts, so it can be unit-tested directly and so the
 * page component itself only has to do I/O (fetch transactions/watchlist_
 * items/cards) and rendering, not business logic.
 *
 * Answers exactly one question per section: "did anything change about MY
 * OWN cards since I last looked" — not a re-hash of the public market
 * list's aggregate stats (MoverStrip/TodaysPicks already cover the whole
 * catalog; this is deliberately scoped to only the cards this specific
 * user holds or watches).
 */
export interface DashboardSummary {
  currentValue: number;
  unrealizedPnl: number;
  realizedPnl: number;
  totalPnl: number;
  holdingsCount: number;
  // Each triggered watchlist item paired with its card (if still resolvable
  // — a card could in principle be missing from the fetched set if it was
  // deleted after the watchlist item was created; conditionMet() already
  // treats a missing card as never-triggered, so this list only ever
  // contains items where a card WAS found).
  triggeredItems: { item: WatchlistItem; card: DashboardCardInfo }[];
  // Top movers among ONLY the cards this user holds or watches, not the
  // full catalog. Excludes cards with no pct_vs_avg30 (not auto-tracked) —
  // ranking by a null/0 fallback would otherwise bury genuine movers under
  // untracked cards sorted arbitrarily.
  gainers: DashboardCardInfo[];
  losers: DashboardCardInfo[];
  // How many of the user's held/watched cards are NOT auto-tracked
  // (isAutoTracked() false) — folds in the "make data freshness/gaps
  // explicit" concern into one line rather than a separate feature.
  untrackedCount: number;
  hasNothing: boolean;
}

export function buildDashboardSummary(
  transactions: Transaction[],
  watchlistItems: WatchlistItem[],
  cards: DashboardCardInfo[]
): DashboardSummary {
  const pnl = computePnl(transactions);
  const cardById = new Map(cards.map((c) => [c.id, c]));

  const currentValue = pnl.holdings.reduce((sum, h) => {
    const price = cardById.get(h.cardId)?.current_price ?? 0;
    return sum + price * h.quantity;
  }, 0);
  const unrealizedPnl = currentValue - pnl.costBasisTotal;
  const totalPnl = unrealizedPnl + pnl.realizedPnl;

  const triggeredItems: DashboardSummary["triggeredItems"] = [];
  for (const item of watchlistItems) {
    const card = cardById.get(item.card_id);
    const met = conditionMet(
      item.alert_rule,
      card && { pctVsAvg30: card.pct_vs_avg30, currentPrice: card.current_price }
    );
    if (met && card) triggeredItems.push({ item, card });
  }

  const relevantCardIds = new Set([
    ...pnl.holdings.map((h) => h.cardId),
    ...watchlistItems.map((i) => i.card_id),
  ]);
  const relevantCards = cards.filter((c) => relevantCardIds.has(c.id));
  const trackedCards = relevantCards.filter(
    (c): c is DashboardCardInfo & { pct_vs_avg30: number } => c.pct_vs_avg30 !== null
  );
  const gainers = [...trackedCards].sort((a, b) => b.pct_vs_avg30 - a.pct_vs_avg30).slice(0, 3);
  const losers = [...trackedCards].sort((a, b) => a.pct_vs_avg30 - b.pct_vs_avg30).slice(0, 3);

  const untrackedCount = relevantCards.filter((c) => !isAutoTracked(c)).length;

  return {
    currentValue,
    unrealizedPnl,
    realizedPnl: pnl.realizedPnl,
    totalPnl,
    holdingsCount: pnl.holdings.length,
    triggeredItems,
    gainers,
    losers,
    untrackedCount,
    // Checks `transactions.length`, not `pnl.holdings.length` (self-review,
    // 2026-09-13, found while re-checking this feature without Codex's
    // parallel verification): a user who bought and later fully sold
    // everything has pnl.holdings.length === 0 despite having real trading
    // history — this used to show the brand-new-user "まだ何もありません"
    // invitation to someone who has actually used the app extensively,
    // just doesn't currently hold anything.
    hasNothing: transactions.length === 0 && watchlistItems.length === 0,
  };
}
