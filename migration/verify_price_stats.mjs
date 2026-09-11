// Regression test for src/lib/priceStats.ts's computeStats(), which fixed a
// real bug (2026-09-11): averages were computed over "the last N snapshot
// ROWS" instead of "the last N calendar DAYS", silently corrupting
// avg30/avg90/judgment for any card with non-daily snapshot cadence (see
// migration/fix_avg_window_bug.mjs and README.md for the full story — 438 of
// 844 real-quality cards were affected, 230 had a wrong judgment).
//
// Imports the real src/lib/priceStats.ts (not a hand-copied reimplementation
// — migration/verify_pnl_logic.mjs was changed to this pattern for the same
// reason: a copy doesn't catch regressions when the real implementation
// changes). No DB connection needed.
//
// Run: node --experimental-strip-types migration/verify_price_stats.mjs
import { computeStats } from "../src/lib/priceStats.ts";

let pass = 0;
let fail = 0;
function assertEqual(actual, expected, label) {
  const ok = Math.abs(actual - expected) < 0.05;
  if (ok) {
    pass++;
  } else {
    fail++;
    console.error(`FAIL: ${label} — expected ${expected}, got ${actual}`);
  }
}

function daysAgo(base, n) {
  const d = new Date(`${base}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

const TODAY = "2026-09-11";

// Scenario 1: dense daily history, 40 consecutive days, prices 1..40 (oldest
// to newest). avg30 must be the average of exactly the last 30 daily values
// (11..40 = avg 25.5), matching the old "last 30 rows" behavior for daily
// cadence — this is the fencepost case the fix had to get right.
{
  const history = Array.from({ length: 40 }, (_, i) => ({
    snapshot_date: daysAgo(TODAY, 39 - i),
    price: i + 1, // 1, 2, ..., 40 — 40 (today) is current
  }));
  const stats = computeStats(history);
  assertEqual(stats.current_price, 40, "dense: current_price");
  // computeStats rounds avg30/avg90 to the nearest integer (Math.round),
  // so the exact mean 25.5 comes back as 26 — expected values here account
  // for that rounding, not just the raw mean.
  assertEqual(stats.avg30, Math.round((11 + 40) / 2), "dense: avg30 = avg of last 30 daily values");
  assertEqual(stats.avg90, Math.round((1 + 40) / 2), "dense: avg90 = avg of all 40 (fewer than 90 days exist)");
}

// Scenario 2: sparse history — a card whose only two snapshots are today and
// ~9 months ago (the exact shape of the real bug: bulk-imported historical
// data, ~biweekly cadence, most recent entry far outside the 30/90-day
// window). avg30 and avg90 must equal current_price (today is the only
// point within either window) — NOT collapse to "average of all history"
// the way the old row-count-based slice did.
{
  const history = [
    { snapshot_date: daysAgo(TODAY, 270), price: 100 },
    { snapshot_date: TODAY, price: 500 },
  ];
  const stats = computeStats(history);
  assertEqual(stats.avg30, 500, "sparse: avg30 excludes the 270-day-old point");
  assertEqual(stats.avg90, 500, "sparse: avg90 excludes the 270-day-old point");
  assertEqual(stats.pct_vs_avg30, 0, "sparse: pct_vs_avg30 is 0% (no other point in window)");
  assertEqual(stats.judgment === "適正" ? 1 : 0, 1, "sparse: judgment is 適正, not skewed by the old point");
}

// Scenario 3: boundary — a "last 30 days" window is inclusive of today, so
// it spans today back through 29 days ago (30 distinct calendar days total).
// A point exactly 29 days old must be INCLUDED; a point exactly 30 days old
// must be EXCLUDED. This is the exact off-by-one the fix's own dry run
// caught (see COORDINATION.md / commit 552434b).
{
  const historyIncluded = [
    { snapshot_date: daysAgo(TODAY, 29), price: 100 },
    { snapshot_date: TODAY, price: 200 },
  ];
  assertEqual(computeStats(historyIncluded).avg30, 150, "boundary: 29-day-old point IS included");

  const historyExcluded = [
    { snapshot_date: daysAgo(TODAY, 30), price: 100 },
    { snapshot_date: TODAY, price: 200 },
  ];
  assertEqual(computeStats(historyExcluded).avg30, 200, "boundary: 30-day-old point is EXCLUDED");
}

// Scenario 4: judgment/trend thresholds still fire correctly off the
// calendar-filtered average (>15% / <-15% for judgment, >3% / <-3% for
// trend). Note avg30 includes TODAY's own price (the window is "current
// price plus history back to 29 days ago", not "history excluding today")
// — both points here fall in the 30-day window, so avg30 = (800+1200)/2 =
// 1000, giving a clean +20% vs today's 1200.
{
  const stats = computeStats([
    { snapshot_date: daysAgo(TODAY, 10), price: 800 },
    { snapshot_date: TODAY, price: 1200 },
  ]);
  assertEqual(stats.avg30, 1000, "threshold: avg30 includes both in-window points");
  assertEqual(stats.pct_vs_avg30, 20, "threshold: +20% vs avg30");
  assertEqual(stats.judgment === "割高" ? 1 : 0, 1, "threshold: +20% is 割高 (>15%)");
  assertEqual(stats.trend_direction === "rising" ? 1 : 0, 1, "threshold: +20% is rising (>3%)");
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
