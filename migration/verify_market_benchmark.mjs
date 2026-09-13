// Regression test for src/lib/marketBenchmark.ts's computeMarketBenchmark()
// — "あなたのポートフォリオ vs 市場平均" (added 2026-09-13 as a
// differentiation feature: comparing a specific user's holdings against
// the whole catalog's movement is something only this app can do, since
// only it already tracks both datasets).
//
// Run: node --experimental-strip-types migration/verify_market_benchmark.mjs
import { register } from "node:module";
register("./_test_mocks/loader.mjs", import.meta.url);

const { computeMarketBenchmark } = await import("../src/lib/marketBenchmark.ts");

let pass = 0;
let fail = 0;
function assertEqual(actual, expected, label) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    pass++;
  } else {
    fail++;
    console.error(`FAIL: ${label} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function holding(cardId, quantity) {
  return { cardId, quantity, costBasis: 0, avgCost: 0 };
}

// T1: two held cards, different position sizes — the LARGER position must
// dominate the weighted average, not a plain per-card average (which would
// give a materially different, wrong answer here).
{
  const holdings = [holding("small", 1), holding("big", 9)];
  const cardById = new Map([
    ["small", { current_price: 100, pct_vs_avg30: 50 }], // value 100, weight small
    ["big", { current_price: 100, pct_vs_avg30: -10 }], // value 900, weight big
  ]);
  const result = computeMarketBenchmark(holdings, cardById, [10, -10, 20, -20]);
  // weighted: (100*50 + 900*-10) / (100+900) = (5000 - 9000) / 1000 = -4
  assertEqual(result.portfolioAvgPct, -4, "T1: value-weighted average is dominated by the larger position, not a naive per-card average (which would be +20)");
  assertEqual(result.marketAvgPct, 0, "T1: market average is the plain mean of catalogPctValues (10-10+20-20=0)/4=0");
  assertEqual(result.excludedHoldingsCount, 0, "T1: both holdings contributed");
}

// T2: a held card with no known current_price is excluded from the
// weighted average (can't be weighted) and counted, not silently zeroed —
// matches portfolioValuation.ts's "unknown, not zero" principle.
{
  const holdings = [holding("priced", 1), holding("unpriced", 1)];
  const cardById = new Map([
    ["priced", { current_price: 100, pct_vs_avg30: 20 }],
    ["unpriced", { current_price: null, pct_vs_avg30: null }],
  ]);
  const result = computeMarketBenchmark(holdings, cardById, [0]);
  assertEqual(result.portfolioAvgPct, 20, "T2: portfolioAvgPct reflects only the priced+tracked holding");
  assertEqual(result.excludedHoldingsCount, 1, "T2: the unpriced holding is counted as excluded, not dropped silently");
}

// T3: a held card with a known price but no pct_vs_avg30 (not auto-tracked,
// e.g. data_quality 'flat') is also excluded — has a price to weight by,
// but nothing to weight (no pct to average).
{
  const holdings = [holding("tracked", 1), holding("untracked", 1)];
  const cardById = new Map([
    ["tracked", { current_price: 100, pct_vs_avg30: 10 }],
    ["untracked", { current_price: 500, pct_vs_avg30: null }],
  ]);
  const result = computeMarketBenchmark(holdings, cardById, [0]);
  assertEqual(result.portfolioAvgPct, 10, "T3: an untracked card (no pct_vs_avg30) is excluded even though its price is known");
  assertEqual(result.excludedHoldingsCount, 1, "T3: excludedHoldingsCount reflects the untracked card");
}

// T4: no holdings contribute at all (empty portfolio, or every holding
// excluded) -> portfolioAvgPct is null, not 0 or NaN.
{
  const result = computeMarketBenchmark([], new Map(), [10, 20]);
  assertEqual(result.portfolioAvgPct, null, "T4: no holdings -> null, not a fabricated 0");
  assertEqual(result.marketAvgPct, 15, "T4: marketAvgPct is still computed from the catalog values regardless of portfolio state");
}

// T5: empty catalog values (e.g. a read failure or genuinely zero
// 'real'-quality cards) -> marketAvgPct is null, not 0 or NaN.
{
  const holdings = [holding("c1", 1)];
  const cardById = new Map([["c1", { current_price: 100, pct_vs_avg30: 10 }]]);
  const result = computeMarketBenchmark(holdings, cardById, []);
  assertEqual(result.marketAvgPct, null, "T5: an empty catalog sample -> null, not 0/NaN");
  assertEqual(result.portfolioAvgPct, 10, "T5: portfolioAvgPct is unaffected by the catalog side being empty");
}

// T6: every contributing holding has a genuine ¥0 price — zero total
// weight, so the weighted average is mathematically undefined -> null,
// not a divide-by-zero NaN.
{
  const holdings = [holding("c1", 5)];
  const cardById = new Map([["c1", { current_price: 0, pct_vs_avg30: 10 }]]);
  const result = computeMarketBenchmark(holdings, cardById, [0]);
  assertEqual(result.portfolioAvgPct, null, "T6: zero total weight (genuine ¥0 prices) returns null, not NaN");
  assertEqual(result.excludedHoldingsCount, 0, "T6: the ¥0-priced card is NOT counted as excluded (it has real, known values — just zero weight)");
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exitCode = 1;
