import { yen } from "./format";
import type { DashboardSummary } from "./dashboardSummary";

/**
 * "週次サマリー通知" (added 2026-09-13) — a different KIND of retention
 * lever than this session's other recent additions. Those (market
 * benchmark, concentration warning, tax report, profit-taking candidates)
 * all made the dashboard richer for someone who already opened it —
 * "reward" in Hook-model terms. This is the "trigger": proactively pulling
 * a user back who might otherwise simply forget the app exists for weeks,
 * using the SAME push infrastructure built for watchlist alerts (see
 * check-watchlist/route.ts) but for a new purpose. WatchlistClient.tsx's
 * opt-in copy was updated to mention this alongside watchlist alerts —
 * sending a notification type the user wasn't told about when they opted
 * in would be a quiet trust violation, not a retention win.
 *
 * Deliberately returns null (send nothing) for a user with nothing to
 * report — a "your portfolio is empty" push would be actively annoying,
 * not a helpful nudge, and hasNothing already means they have no holdings
 * AND no watchlist items.
 */
export function buildWeeklyDigestPayload(
  summary: DashboardSummary
): { title: string; body: string; url: string } | null {
  if (summary.hasNothing) return null;

  const parts: string[] = [];
  if (summary.holdingsCount > 0 || summary.realizedPnl !== 0) {
    parts.push(`合計損益 ${yen(summary.totalPnl)}`);
  }
  if (summary.triggeredItems.length > 0) {
    parts.push(`ウォッチ条件成立 ${summary.triggeredItems.length}件`);
  }
  if (summary.profitTakingCandidates.length > 0) {
    parts.push(`利益確定候補 ${summary.profitTakingCandidates.length}件`);
  }
  // Every branch above requires either holdings, a realized history, a
  // triggered watch, or a profit-taking candidate — a user who fails all
  // of these but isn't hasNothing (e.g. only watches cards, none currently
  // triggered) still gets a plain nudge rather than no digest at all.
  const body = parts.length > 0 ? parts.join("／") : "今週の相場・保有状況を確認してみましょう。";

  return { title: "📬 今週のトレカ相場ナビ", body, url: "/dashboard" };
}
