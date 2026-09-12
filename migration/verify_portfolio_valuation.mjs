// Regression test for src/lib/portfolioValuation.ts — the shared "current
// price might be unknown, don't fabricate 0" logic added 2026-09-13 in
// response to Codex's independent review (reproduction: a held card with
// current_price:null showed 保有評価額¥0・含み損益-原価全額, silently
// treating "unknown" as "confirmed worthless"). See COORDINATION.md.
//
// Run: node --experimental-strip-types migration/verify_portfolio_valuation.mjs
import { register } from "node:module";
register("./_test_mocks/loader.mjs", import.meta.url);

const { computePortfolioValuation, cardHoldingValue } = await import(
  "../src/lib/portfolioValuation.ts"
);

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

function holding(cardId, quantity, costBasis) {
  return { cardId, quantity, costBasis, avgCost: costBasis / quantity };
}

// T1: all holdings priced — behaves like the old (currentValue - totalCost)
// math exactly, unpricedHoldingsCount is 0.
{
  const holdings = [holding("c1", 2, 2000), holding("c2", 1, 5000)];
  const prices = new Map([
    ["c1", 1500], // value 3000
    ["c2", 4000], // value 4000
  ]);
  const v = computePortfolioValuation(holdings, prices);
  assertEqual(
    v,
    { currentValue: 7000, unrealizedPnl: 0, unpricedHoldingsCount: 0 },
    "T1: fully-priced portfolio — currentValue 7000, cost 7000, unrealizedPnl 0"
  );
}

// T2: Codex's exact reproduction — one holding, current_price: null. The
// old `?? 0` code showed 保有評価額¥0・含み損益-10000 (a confident 100%
// loss). The fix must show currentValue 0 (nothing WAS evaluable, which is
// different from "evaluated to 0") with unpricedHoldingsCount 1, and
// unrealizedPnl 0 (not -10000) — the unpriced holding's cost basis is
// excluded from the comparison, not charged against a 0 value.
{
  const holdings = [holding("c1", 1, 10000)];
  const prices = new Map([["c1", null]]);
  const v = computePortfolioValuation(holdings, prices);
  assertEqual(
    v,
    { currentValue: 0, unrealizedPnl: 0, unpricedHoldingsCount: 1 },
    "T2: null current_price is NOT charged as a confirmed -10000 loss; unrealizedPnl is 0, flagged as 1 unpriced holding"
  );
}

// T3: a literal price of ¥0 must be treated as a REAL, known value (not
// reclassified as "unknown") — this is the distinction Codex explicitly
// called out ("実測0円は0円で正しいがnullとは区別が必要").
{
  const holdings = [holding("c1", 3, 300)];
  const prices = new Map([["c1", 0]]);
  const v = computePortfolioValuation(holdings, prices);
  assertEqual(
    v,
    { currentValue: 0, unrealizedPnl: -300, unpricedHoldingsCount: 0 },
    "T3: a genuine ¥0 price counts as known (unpricedHoldingsCount 0) and produces a real -300 unrealized loss, unlike T2's null"
  );
}

// T4: a holding whose card row is missing entirely from the map (e.g. a
// deleted card, or simply never fetched) is treated the same as an explicit
// null — Map.get() returns undefined, which the `== null` check also catches.
{
  const holdings = [holding("ghost", 1, 999)];
  const prices = new Map();
  const v = computePortfolioValuation(holdings, prices);
  assertEqual(
    v,
    { currentValue: 0, unrealizedPnl: 0, unpricedHoldingsCount: 1 },
    "T4: a card missing from the price map is treated as unpriced, same as an explicit null"
  );
}

// T5: mixed portfolio — one priced holding with a real gain, one unpriced
// holding. unrealizedPnl must reflect ONLY the priced holding's gain, and
// must NOT be dragged down by the unpriced holding's cost basis.
{
  const holdings = [holding("priced", 1, 1000), holding("unpriced", 1, 5000)];
  const prices = new Map([
    ["priced", 1200], // +200 gain
    ["unpriced", null],
  ]);
  const v = computePortfolioValuation(holdings, prices);
  assertEqual(
    v,
    { currentValue: 1200, unrealizedPnl: 200, unpricedHoldingsCount: 1 },
    "T5: mixed portfolio — unrealizedPnl (+200) reflects only the priced holding, unaffected by the unpriced one's 5000 cost basis"
  );
}

// T6: empty portfolio — no crash, all zeros.
{
  const v = computePortfolioValuation([], new Map());
  assertEqual(v, { currentValue: 0, unrealizedPnl: 0, unpricedHoldingsCount: 0 }, "T6: empty portfolio");
}

// cardHoldingValue: the per-card helper used by row-level displays.
assertEqual(cardHoldingValue(1000, 3), 3000, "T7: cardHoldingValue with a known price multiplies normally");
assertEqual(cardHoldingValue(0, 3), 0, "T8: cardHoldingValue with a genuine ¥0 price returns 0 (a real value), not null");
assertEqual(cardHoldingValue(null, 3), null, "T9: cardHoldingValue with a null price returns null, never a fabricated 0");
assertEqual(cardHoldingValue(undefined, 3), null, "T10: cardHoldingValue with undefined (card not found) also returns null");

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exitCode = 1;
