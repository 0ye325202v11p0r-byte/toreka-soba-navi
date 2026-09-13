import { computePnl } from "./pnl";
import { conditionMet } from "./watchlistRule";
import { isAutoTracked } from "./format";
import { computePortfolioValuation } from "./portfolioValuation";
import { computeMarketBenchmark, type MarketBenchmarkResult } from "./marketBenchmark";
import { findProfitTakingCandidates, type ProfitTakingCandidate } from "./profitTaking";
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
  // How many currently-held cards have no known current_price (null, or
  // the card row wasn't found) — see portfolioValuation.ts. currentValue/
  // unrealizedPnl/totalPnl above cover only the OTHER holdings; the caller
  // must show a caveat rather than presenting those totals as complete
  // whenever this is > 0 (Codex independent review, 2026-09-13).
  unpricedHoldingsCount: number;
  // The single most stale AUTO-TRACKED relevant card, if its last update is
  // older than STALE_THRESHOLD_MS — null if every auto-tracked relevant
  // card is fresh enough, or there are none. Added 2026-09-13 (Codex UX
  // review, cycle 2): a returning user has no way to tell whether their
  // holdings' prices are current or several days stale — the dashboard is
  // the main "did anything change" landing page, but never surfaced this at
  // all. Deliberately scoped to only auto-tracked cards: a 'flat'/'partial'
  // card is EXPECTED to never update (already labeled "not auto-updated"
  // elsewhere), so flagging it here would contradict that label and alarm
  // the user over normal, by-design behavior.
  staleCard: StaleCardInfo | null;
  // "あなたのポートフォリオ vs 市場平均" (added 2026-09-13) — see
  // marketBenchmark.ts for why this specific comparison is the actual
  // differentiated value this app can offer that a plain price-checking
  // site can't: it needs both this user's own holdings AND a catalog-wide
  // sample, which only an app already tracking both ever has.
  benchmark: MarketBenchmarkResult;
  // "利益確定を検討してもよいかもしれないカード" (added 2026-09-13,
  // differentiation feature #4) — see profitTaking.ts for the exact
  // condition (real unrealized gain AND market judgment 割高, both
  // required). Sorted by gainPct descending; caller decides how many to
  // show.
  profitTakingCandidates: ProfitTakingCandidate[];
  hasNothing: boolean;
}

export interface StaleCardInfo {
  name: string;
  updatedAt: string;
}

// ~1.5x the daily cron cadence — tolerant of normal timing jitter (the cron
// doesn't fire at the exact same instant every day) while still catching a
// genuinely missed or persistently failing update for that specific card.
const STALE_THRESHOLD_MS = 36 * 60 * 60 * 1000;

function findStalestTrackedCard(
  relevantCards: DashboardCardInfo[],
  now: Date
): StaleCardInfo | null {
  let stalest: (StaleCardInfo & { ageMs: number }) | null = null;
  for (const c of relevantCards) {
    if (!isAutoTracked(c)) continue;
    const ageMs = now.getTime() - new Date(c.updated_at).getTime();
    if (ageMs > STALE_THRESHOLD_MS && (!stalest || ageMs > stalest.ageMs)) {
      stalest = { name: c.name, updatedAt: c.updated_at, ageMs };
    }
  }
  return stalest ? { name: stalest.name, updatedAt: stalest.updatedAt } : null;
}

export function buildDashboardSummary(
  transactions: Transaction[],
  watchlistItems: WatchlistItem[],
  cards: DashboardCardInfo[],
  // Injectable for deterministic tests (never a bare `new Date()` used
  // internally without a way to override it) — real callers simply omit it.
  now: Date = new Date(),
  // A sample of pct_vs_avg30 across the whole catalog (not just this
  // user's relevant cards) — "the market," for the benchmark comparison.
  // Optional/defaulted to [] so every existing caller/test that doesn't
  // care about the benchmark doesn't need updating just to keep compiling.
  catalogPctValues: number[] = []
): DashboardSummary {
  const pnl = computePnl(transactions);
  const cardById = new Map(cards.map((c) => [c.id, c]));

  // Codex independent review (2026-09-13): a held card whose current_price
  // is null (a real, nullable DB column — a card can exist before its first
  // price scrape) used to fall back to `?? 0`, showing a confident 保有評価額
  // ¥0 and a 100%-of-cost 含み損益, indistinguishable from an actually-
  // confirmed total loss. computePortfolioValuation() instead excludes such
  // holdings from currentValue/unrealizedPnl and reports how many were
  // excluded via unpricedHoldingsCount, so the dashboard can show an honest
  // "N銘柄は集計対象外" caveat instead of a wrong number.
  const priceById = new Map(cards.map((c) => [c.id, c.current_price]));
  const valuation = computePortfolioValuation(pnl.holdings, priceById);
  const currentValue = valuation.currentValue;
  const unrealizedPnl = valuation.unrealizedPnl;
  // realizedPnl depends only on historical buy/sell prices (computePnl), so
  // it's always fully known regardless of unpriced holdings — totalPnl adds
  // it to the (necessarily partial, if unpricedHoldingsCount > 0) unrealizedPnl.
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
  // Filtered to their own sign (self-review, 2026-09-13 — found while
  // rendering the whole dashboard together with realistic data for the
  // first time): with only a handful of relevant cards, "top 3 by
  // pct_vs_avg30" with no sign filter let a card down -20% appear under
  // "📈 値上がり中" simply for being the least-negative of a small set —
  // factually misleading under that header, not just an edge case. A user
  // with genuinely no cards currently up (or down) now correctly sees an
  // empty list for that side rather than a wrong-signed one.
  const gainers = [...trackedCards]
    .filter((c) => c.pct_vs_avg30 > 0)
    .sort((a, b) => b.pct_vs_avg30 - a.pct_vs_avg30)
    .slice(0, 3);
  const losers = [...trackedCards]
    .filter((c) => c.pct_vs_avg30 < 0)
    .sort((a, b) => a.pct_vs_avg30 - b.pct_vs_avg30)
    .slice(0, 3);

  const untrackedCount = relevantCards.filter((c) => !isAutoTracked(c)).length;
  const staleCard = findStalestTrackedCard(relevantCards, now);
  const benchmark = computeMarketBenchmark(pnl.holdings, cardById, catalogPctValues);
  const profitTakingCandidates = findProfitTakingCandidates(pnl.holdings, cardById);

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
    unpricedHoldingsCount: valuation.unpricedHoldingsCount,
    staleCard,
    benchmark,
    profitTakingCandidates,
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
