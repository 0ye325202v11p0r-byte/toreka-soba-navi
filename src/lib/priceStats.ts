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
  // price_snapshots.price is a Postgres `numeric` column, which PostgREST
  // may serialize as a JSON string rather than a JSON number (the same risk
  // src/lib/format.ts's yen()/pct() and src/lib/pnl.ts's price_per_unit
  // handling already defend against — this function was the one numeric
  // consumer in the codebase that didn't). The TypeScript `price: number`
  // annotation is a compile-time promise only; it does not coerce an actual
  // string at runtime. Without this, a string price would make `s + v`
  // below do STRING CONCATENATION instead of addition (e.g. summing
  // "1000"/"1200"/"1100" this way, then dividing the concatenated-and-
  // reparsed result by count, produces something like avg30=6000550 instead
  // of ~1100 — confirmed by feeding string prices through this function
  // during self-review, 2026-09-12). Not confirmed to have actually
  // happened against real Supabase data (an active occurrence would have
  // produced obviously absurd avg30/90 values that the earlier avg-window
  // audit — see fix_avg_window_bug.mjs — would very likely have caught);
  // this coercion is defensive hardening, matching this codebase's existing
  // convention, not a fix for a proven incident.
  const sorted = [...history]
    .map((h) => ({ snapshot_date: h.snapshot_date, price: Number(h.price) }))
    .sort((a, b) => a.snapshot_date.localeCompare(b.snapshot_date));
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
