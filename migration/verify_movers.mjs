// Regression test for src/lib/movers.ts's findTopMovers() — shared logic
// extracted 2026-09-13 after finding the SAME sign-filter bug (already
// fixed in dashboardSummary.ts earlier that day) independently present in
// MoverStrip.tsx. See movers.ts's header comment.
//
// Run: node --experimental-strip-types migration/verify_movers.mjs
import { register } from "node:module";
register("./_test_mocks/loader.mjs", import.meta.url);

const { findTopMovers } = await import("../src/lib/movers.ts");

let pass = 0;
let fail = 0;
function assertEqual(actual, expected, label) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) pass++;
  else {
    fail++;
    console.error(`FAIL: ${label} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function card(id, pct) {
  return { id, pct_vs_avg30: pct };
}

// T1: basic case — gainers sorted descending, losers sorted ascending
// (most-negative first), capped at count.
{
  const cards = [card("a", 10), card("b", 50), card("c", -5), card("d", -30), card("e", 20)];
  const { gainers, losers } = findTopMovers(cards, 2);
  assertEqual(gainers.map((c) => c.id), ["b", "e"], "T1: gainers is top 2 by pct descending");
  assertEqual(losers.map((c) => c.id), ["d", "c"], "T1: losers is top 2 by pct ascending (most negative first)");
}

// T2: fewer tracked cards than `count` are genuinely positive — gainers
// must NOT pad out with negative cards to reach `count`. This is the exact
// bug found in both dashboardSummary.ts and MoverStrip.tsx.
{
  const cards = [card("a", -5), card("b", -30)];
  const { gainers, losers } = findTopMovers(cards, 5);
  assertEqual(gainers, [], "T2: gainers is empty when every card is actually down, never the 'least bad' ones");
  assertEqual(losers.map((c) => c.id), ["b", "a"], "T2: losers still lists both, sorted most-negative first");
}

// T3: symmetric case — all cards positive, losers must be empty.
{
  const cards = [card("a", 5), card("b", 30)];
  const { gainers, losers } = findTopMovers(cards, 5);
  assertEqual(losers, [], "T3: losers is empty when every card is actually up");
  assertEqual(gainers.map((c) => c.id), ["b", "a"], "T3: gainers lists both, sorted most-positive first");
}

// T4: null pct_vs_avg30 (untracked card) is excluded entirely — never
// sorted in via some 0-fallback.
{
  const cards = [card("a", 10), card("b", null), card("c", -10)];
  const { gainers, losers } = findTopMovers(cards, 5);
  assertEqual(gainers.map((c) => c.id), ["a"], "T4: the null-pct card never appears among gainers");
  assertEqual(losers.map((c) => c.id), ["c"], "T4: the null-pct card never appears among losers");
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exitCode = 1;
