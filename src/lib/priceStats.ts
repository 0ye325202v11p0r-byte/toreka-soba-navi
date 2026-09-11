import type { Judgment } from "./types";

export interface PriceStats {
  current_price: number;
  avg30: number;
  avg90: number;
  pct_vs_avg30: number;
  pct_vs_avg90: number;
  low30: number;
  change_amt30: number;
  judgment: Judgment;
  trend_direction: "rising" | "declining" | "flat";
}

/**
 * Computes current price stats (30/90-day averages, judgment, trend) from a
 * card's snapshot history.
 *
 * Averages are filtered by actual calendar date, not by array position.
 * Bulk-imported cards can have sparse historical snapshots (e.g. one every
 * ~2 weeks, going back up to a year) rather than a true daily cadence —
 * taking "the last 30 array elements" as a stand-in for "the last 30 days"
 * (the original approach) silently averaged over months or years of history
 * for any such card, while still labeling the result "30日平均比" and
 * deriving 割安/割高 from it. Filtering by snapshot_date keeps the window the
 * label actually claims, even if that means very few (or just one) points
 * for a card that hasn't been tracked daily yet — which is the honest answer
 * for that card, not a bug to paper over.
 */
export function computeStats(history: { snapshot_date: string; price: number }[]): PriceStats {
  const sorted = [...history].sort((a, b) => a.snapshot_date.localeCompare(b.snapshot_date));
  const current = sorted[sorted.length - 1].price;
  const currentDate = sorted[sorted.length - 1].snapshot_date;

  const withinDays = (days: number): number[] => {
    // "last 30 days" means a 30-day-wide inclusive window (today counts as
    // one of the 30), matching what the old "last 30 array elements" slice
    // meant for daily-cadence data — so the cutoff is days-1 back, not days.
    const cutoffMs = new Date(`${currentDate}T00:00:00Z`).getTime() - (days - 1) * 24 * 60 * 60 * 1000;
    const cutoffStr = new Date(cutoffMs).toISOString().slice(0, 10);
    return sorted.filter((h) => h.snapshot_date >= cutoffStr).map((h) => h.price);
  };

  const last30 = withinDays(30);
  const last90 = withinDays(90);
  const avg = (arr: number[]) => arr.reduce((s, v) => s + v, 0) / arr.length;
  const avg30 = avg(last30);
  const avg90 = avg(last90);
  const pctVsAvg30 = Math.round(((current - avg30) / avg30) * 1000) / 10;
  const pctVsAvg90 = Math.round(((current - avg90) / avg90) * 1000) / 10;
  const low30 = Math.min(...last30);
  const judgment: Judgment = pctVsAvg30 > 15 ? "割高" : pctVsAvg30 < -15 ? "割安" : "適正";
  const trend: PriceStats["trend_direction"] = pctVsAvg30 > 3 ? "rising" : pctVsAvg30 < -3 ? "declining" : "flat";
  return {
    current_price: current,
    avg30: Math.round(avg30),
    avg90: Math.round(avg90),
    pct_vs_avg30: pctVsAvg30,
    pct_vs_avg90: pctVsAvg90,
    low30,
    change_amt30: current - low30,
    judgment,
    trend_direction: trend,
  };
}
