// Regression test for src/lib/profitTaking.ts's findProfitTakingCandidates()
// — differentiation feature #4 (2026-09-13): combines the user's own cost
// basis with the card's market judgment, something only possible because
// this app already tracks both.
//
// Run: node --experimental-strip-types migration/verify_profit_taking.mjs
import { register } from "node:module";
register("./_test_mocks/loader.mjs", import.meta.url);

const { findProfitTakingCandidates } = await import("../src/lib/profitTaking.ts");

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
function card(name, price, judgment) {
  return { name, current_price: price, judgment };
}

// T1: the clean positive case — held card is judgment='割高' AND has a real
// unrealized gain -> flagged, with correct gain/gainPct.
{
  const holdings = [holding("c1", 1, 1000)];
  const cardById = new Map([["c1", card("好調カード", 1500, "割高")]]);
  const result = findProfitTakingCandidates(holdings, cardById);
  assertEqual(result, [{ cardId: "c1", cardName: "好調カード", unrealizedGain: 500, gainPct: 50 }], "T1: 割高 + real gain -> flagged with correct numbers");
}

// T2: judgment is '適正' (not 割高), even with a large unrealized gain ->
// NOT flagged. Being up is not enough on its own.
{
  const holdings = [holding("c1", 1, 1000)];
  const cardById = new Map([["c1", card("適正カード", 5000, "適正")]]);
  assertEqual(findProfitTakingCandidates(holdings, cardById), [], "T2: a large gain alone (judgment 適正) is not flagged");
}

// T3: judgment is '割高' but the user is actually at a LOSS (bought even
// higher than today's already-inflated price) -> NOT flagged. This is the
// exact case this feature must not misclassify as a profit-taking signal.
{
  const holdings = [holding("c1", 1, 2000)];
  const cardById = new Map([["c1", card("実は含み損カード", 1500, "割高")]]);
  assertEqual(findProfitTakingCandidates(holdings, cardById), [], "T3: 割高 alone with an actual unrealized LOSS is not flagged");
}

// T4: 割安 or 割高-adjacent judgments other than exactly '割高' string must
// not match by accident (e.g. a null judgment for an untracked card).
{
  const holdings = [holding("c1", 1, 1000), holding("c2", 1, 1000)];
  const cardById = new Map([
    ["c1", card("割安カード", 1500, "割安")],
    ["c2", card("判定なしカード", 1500, null)],
  ]);
  assertEqual(findProfitTakingCandidates(holdings, cardById), [], "T4: 割安 and null judgment are both correctly excluded");
}

// T5: a held card with unknown current_price (null) must be excluded, not
// crash or fabricate a gain — matches portfolioValuation.ts's principle.
{
  const holdings = [holding("c1", 1, 1000)];
  const cardById = new Map([["c1", card("価格不明カード", null, "割高")]]);
  assertEqual(findProfitTakingCandidates(holdings, cardById), [], "T5: unknown current_price excludes the card rather than crashing");
}

// T6: a holding whose card row isn't in the map at all (e.g. deleted) is
// excluded, not a crash.
{
  const holdings = [holding("ghost", 1, 1000)];
  assertEqual(findProfitTakingCandidates(holdings, new Map()), [], "T6: a missing card row is excluded, not a crash");
}

// T7: multiple candidates are sorted by gainPct descending, not insertion
// order or absolute yen amount.
{
  const holdings = [holding("small-pct", 1, 1000), holding("big-pct", 1, 100)];
  const cardById = new Map([
    ["small-pct", card("小さい上昇率だが金額は大きい", 1100, "割高")], // +10%, +100円
    ["big-pct", card("大きい上昇率", 300, "割高")], // +200%, +200円
  ]);
  const result = findProfitTakingCandidates(holdings, cardById);
  assertEqual(result.map((c) => c.cardId), ["big-pct", "small-pct"], "T7: sorted by gainPct descending (200% before 10%), not by absolute yen gain");
}

// T8: exactly break-even (gain === 0) must NOT be flagged — "if I sell right
// now I make exactly nothing" isn't a profit-taking opportunity.
{
  const holdings = [holding("c1", 1, 1000)];
  const cardById = new Map([["c1", card("損益ゼロカード", 1000, "割高")]]);
  assertEqual(findProfitTakingCandidates(holdings, cardById), [], "T8: exactly zero unrealized gain is not flagged");
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exitCode = 1;
