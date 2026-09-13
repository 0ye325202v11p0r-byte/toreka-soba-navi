export interface MoverCard {
  pct_vs_avg30: number | null;
}

export interface TopMovers<T> {
  gainers: T[];
  losers: T[];
}

/**
 * Shared "top N gainers/losers by 30-day average" logic — extracted
 * 2026-09-13 while building the weekly-movers shareable page, after
 * noticing MoverStrip.tsx had the exact same sign-filter bug already found
 * and fixed in dashboardSummary.ts earlier the same day: sorting "top N by
 * pct_vs_avg30" with no sign check can put a card that's actually DOWN
 * under a "gainers" header if fewer than N cards are genuinely positive.
 * At the full ~3,270-card catalog scale this is unlikely to ever be
 * observed (there are almost always 5+ genuinely positive movers site-
 * wide), but the logic itself is identically wrong either way, and this is
 * now the second independent copy of it — worth sharing and testing once
 * rather than trusting every call site to remember the filter.
 */
export function findTopMovers<T extends MoverCard>(cards: T[], count: number): TopMovers<T> {
  const tracked = cards.filter((c): c is T & { pct_vs_avg30: number } => c.pct_vs_avg30 !== null);
  const gainers = tracked
    .filter((c) => c.pct_vs_avg30 > 0)
    .sort((a, b) => b.pct_vs_avg30 - a.pct_vs_avg30)
    .slice(0, count);
  const losers = tracked
    .filter((c) => c.pct_vs_avg30 < 0)
    .sort((a, b) => a.pct_vs_avg30 - b.pct_vs_avg30)
    .slice(0, count);
  return { gainers, losers };
}
