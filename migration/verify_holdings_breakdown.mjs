// Regression test for src/lib/holdingsBreakdown.ts's buildHoldingsBreakdown()
// — the pure aggregation behind the portfolio page's "構成内訳（レアリティ/
// 弾別）" section (roadmap item held over from the 2026-09-13 dashboard
// priority discussion; see COORDINATION.md).
//
// Run: node --experimental-strip-types migration/verify_holdings_breakdown.mjs
import { register } from "node:module";
register("./_test_mocks/loader.mjs", import.meta.url);

const { buildHoldingsBreakdown } = await import("../src/lib/holdingsBreakdown.ts");

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
function card(id, rarity, setName, price) {
  return { id, rarity, set_name: setName, current_price: price };
}

// T1: empty portfolio — both groupings empty, no crash.
{
  const b = buildHoldingsBreakdown([], []);
  assertEqual(b.byRarity, [], "T1: byRarity empty for no holdings");
  assertEqual(b.bySet, [], "T1: bySet empty for no holdings");
}

// T2: two cards, same rarity/different set, one different rarity — groups
// must aggregate cardCount/quantity/value correctly and sort by value desc.
{
  const holdings = [holding("c1", 2), holding("c2", 1), holding("c3", 3)];
  const cards = [
    card("c1", "SR", "setA", 1000), // value 2000
    card("c2", "SR", "setB", 5000), // value 5000
    card("c3", "R", "setA", 100), // value 300
  ];
  const b = buildHoldingsBreakdown(holdings, cards);
  assertEqual(
    b.byRarity,
    [
      { label: "SR", cardCount: 2, quantity: 3, value: 7000, hasUnknownValue: false },
      { label: "R", cardCount: 1, quantity: 3, value: 300, hasUnknownValue: false },
    ],
    "T2: byRarity aggregates across setA/setB and sorts SR (7000) before R (300)"
  );
  assertEqual(
    b.bySet,
    [
      { label: "setB", cardCount: 1, quantity: 1, value: 5000, hasUnknownValue: false },
      { label: "setA", cardCount: 2, quantity: 5, value: 2300, hasUnknownValue: false },
    ],
    "T2: bySet aggregates across SR/R within setA and sorts setB (5000) before setA (2300)"
  );
}

// T3 (updated 2026-09-13, Codex independent review): a card with no price
// data must be flagged via hasUnknownValue, not silently folded into value
// as a fabricated 0 — mirrors portfolioValuation.ts's "unknown, not zero"
// rule (the original version of this test asserted the OLD, buggy `?? 0`
// behavior and has been corrected here, not just re-passed).
{
  const holdings = [holding("c1", 5)];
  const cards = [card("c1", "C", "setA", null)];
  const b = buildHoldingsBreakdown(holdings, cards);
  assertEqual(
    b.byRarity,
    [{ label: "C", cardCount: 1, quantity: 5, value: 0, hasUnknownValue: true }],
    "T3: a priceless card is flagged hasUnknownValue:true, with value 0 meaning 'nothing WAS evaluable', not 'evaluated to 0'"
  );
}

// T4: a card with set_name === null groups under the explicit fallback
// label, never silently merging with a real set named the same way.
{
  const holdings = [holding("c1", 1)];
  const cards = [card("c1", "C", null, 100)];
  const b = buildHoldingsBreakdown(holdings, cards);
  assertEqual(
    b.bySet,
    [{ label: "弾不明", cardCount: 1, quantity: 1, value: 100, hasUnknownValue: false }],
    "T4: null set_name groups under 弾不明"
  );
}

// T5: a holding whose card row wasn't fetched (e.g. deleted after purchase)
// must not be silently dropped from the total — it still groups, under 不明,
// flagged hasUnknownValue (its price is unknowable, not merely unfetched
// this request).
{
  const holdings = [holding("ghost", 2), holding("c1", 1)];
  const cards = [card("c1", "C", "setA", 100)];
  const b = buildHoldingsBreakdown(holdings, cards);
  assertEqual(
    b.byRarity,
    [
      { label: "C", cardCount: 1, quantity: 1, value: 100, hasUnknownValue: false },
      { label: "不明", cardCount: 1, quantity: 2, value: 0, hasUnknownValue: true },
    ],
    "T5: a holding with no matching card row groups under 不明, flagged hasUnknownValue, not dropped"
  );
}

// T6: a group with BOTH a priced and an unpriced card — value must sum only
// the known one, while still flagging the group as partially unknown. This
// is the case a naive per-card fix could miss: the group-level `value` looks
// like a plausible, non-zero number, which makes it easy to forget it's
// actually a partial sum unless hasUnknownValue is checked.
{
  const holdings = [holding("priced", 2), holding("unpriced", 3)];
  const cards = [card("priced", "SR", "setA", 1000), card("unpriced", "SR", "setA", null)];
  const b = buildHoldingsBreakdown(holdings, cards);
  assertEqual(
    b.byRarity,
    [{ label: "SR", cardCount: 2, quantity: 5, value: 2000, hasUnknownValue: true }],
    "T6: a mixed group sums only the priced card (2000), while hasUnknownValue:true signals it's a partial total"
  );
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exitCode = 1;
