import type { WatchlistAlertRule } from "./types";

// Shared by check-watchlist/route.ts, WatchlistClient.tsx, and the new
// DashboardClient.tsx — previously each of the first two carried its own
// identical copy (conditionMet() / ruleIsMet()). Extracted 2026-09-13 while
// building the dashboard, which needed the exact same "is this rule
// currently true" check as a third call site — this project's established
// convention is to share logic once a third copy would otherwise appear
// (see yuyuteiParser.ts's header comment for the same principle applied to
// scrape_yuyutei.mjs/refresh-yuyutei-prices/route.ts).
//
// Evaluates LIVE against the card's current stats — not the same question
// as watchlist_items.last_triggered_at, which only ever gets SET when a
// condition is found true and is never cleared if it later becomes false
// again (see check-watchlist/route.ts's own comment on that column). A
// dashboard/list wanting "is this true right now" must call this against
// fresh card data, not read last_triggered_at as if it meant that.
export function conditionMet(
  rule: WatchlistAlertRule,
  card: { pctVsAvg30: number | null; currentPrice: number | null } | undefined
): boolean {
  const pctVsAvg30 = card?.pctVsAvg30 ?? null;
  const currentPrice = card?.currentPrice ?? null;
  if (rule.type === "pct_vs_avg30") {
    // Cards the daily refresh-prices cron doesn't auto-track (data_quality
    // 'partial' or 'flat' — see isAutoTracked() in src/lib/format.ts) never
    // have a pct_vs_avg30 computed, regardless of which of those two
    // applies. Checking the actual value's nullness here (rather than
    // re-deriving "is this trackable" from data_quality) means this
    // doesn't need to enumerate every quality tier to stay correct — there
    // is simply nothing to evaluate the condition against, so it never
    // fires. This mirrors the warning already shown when registering one.
    if (pctVsAvg30 === null) return false;
    return rule.op === "lte" ? pctVsAvg30 <= rule.value : pctVsAvg30 >= rule.value;
  }
  // "price": works for every card regardless of data_quality, since
  // current_price is always populated (even partial-quality cards have a
  // single reference price) — unlike pct_vs_avg30 this doesn't need
  // tracked history.
  if (currentPrice === null) return false;
  return rule.op === "lte" ? currentPrice <= rule.value : currentPrice >= rule.value;
}
