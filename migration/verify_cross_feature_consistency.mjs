// Cross-feature consistency check (2026-09-13, self-review while working
// without Codex's parallel verification): dashboardSummary.ts,
// portfolioHistory.ts, and pnl.ts were all built and tested independently
// of each other on the same day. Each has its own unit tests proving its
// OWN logic is correct in isolation, but none of them prove the three
// AGREE with each other on the same underlying data — exactly the kind of
// integration gap unit tests miss. This test feeds one realistic,
// multi-card, fee-inclusive transaction history through all three and
// checks their outputs reconcile:
//   - dashboardSummary's currentValue/realizedPnl must match a
//     hand-computed ground truth built directly from computePnl's own
//     holdings.
//   - portfolioHistory's last evaluated point must match a hand-calculated
//     value using ONLY price_snapshots as of that date (never
//     cards.current_price, which is a deliberately separate concept the
//     history function never touches).
//
// Run: node --experimental-strip-types migration/verify_cross_feature_consistency.mjs
import { register } from "node:module";
register("./_test_mocks/loader.mjs", import.meta.url);

const { computePnl } = await import("../src/lib/pnl.ts");
const { buildDashboardSummary } = await import("../src/lib/dashboardSummary.ts");
const { buildPortfolioValueHistory } = await import("../src/lib/portfolioHistory.ts");
const { buildHoldingsBreakdown } = await import("../src/lib/holdingsBreakdown.ts");

let pass = 0;
let fail = 0;
function assertEqual(actual, expected, label) {
  const ok = actual === expected;
  if (ok) pass++;
  else {
    fail++;
    console.error(`FAIL: ${label} — expected ${expected}, got ${actual}`);
  }
}

function txn(cardId, type, quantity, pricePerUnit, date, fee = 0) {
  return {
    id: `t-${cardId}-${date}-${type}`,
    user_id: "u1",
    card_id: cardId,
    type,
    quantity,
    price_per_unit: pricePerUnit,
    fee,
    transaction_date: date,
    note: null,
    created_at: `${date}T00:00:00.000Z`,
  };
}
function snap(cardId, date, price) {
  return { id: `s-${cardId}-${date}`, card_id: cardId, snapshot_date: date, price };
}

// A realistic multi-card session: bought c1 twice (with a fee the second
// time), bought c2 once and sold half of it later (with a fee on the
// sell) — deliberately exercises FIFO across two cards AND fee handling
// on both a buy and a sell, since that's exactly the combination
// dashboardSummary/portfolioHistory each reuse computePnl for.
const transactions = [
  txn("c1", "buy", 2, 1000, "2026-01-01"),
  txn("c1", "buy", 1, 1200, "2026-02-01", 50),
  txn("c2", "buy", 4, 500, "2026-01-15"),
  txn("c2", "sell", 2, 700, "2026-03-01", 20),
];
const cards = [
  { id: "c1", name: "c1", current_price: 1300, pct_vs_avg30: 10, data_quality: "real", source_url: "x" },
  { id: "c2", name: "c2", current_price: 600, pct_vs_avg30: -5, data_quality: "real", source_url: "x" },
];
const snapshotsByCard = new Map([
  ["c1", [snap("c1", "2026-01-01", 1000), snap("c1", "2026-02-01", 1200), snap("c1", "2026-04-01", 1300)]],
  ["c2", [snap("c2", "2026-01-15", 500), snap("c2", "2026-03-01", 700), snap("c2", "2026-04-01", 600)]],
]);

// Ground truth computed directly from computePnl — the "source of truth"
// every other module reuses rather than reimplements.
const pnl = computePnl(transactions);
const groundTruthValue = pnl.holdings.reduce((sum, h) => {
  const card = cards.find((c) => c.id === h.cardId);
  return sum + (card?.current_price ?? 0) * h.quantity;
}, 0);

const summary = buildDashboardSummary(transactions, [], cards);
assertEqual(summary.currentValue, groundTruthValue, "dashboard currentValue matches cards.current_price * pnl.holdings ground truth");
assertEqual(summary.realizedPnl, pnl.realizedPnl, "dashboard realizedPnl matches computePnl's realizedPnl exactly (fee-inclusive)");
assertEqual(summary.holdingsCount, pnl.holdings.length, "dashboard holdingsCount matches pnl.holdings.length");

const history = buildPortfolioValueHistory(transactions, snapshotsByCard);
const lastPoint = history[history.length - 1];
assertEqual(lastPoint.date, "2026-03-01", "history's last point is at the last transaction date");
// At 2026-03-01: c1 holds 3 units (2+1), last c1 snapshot on/before that
// date is 2026-02-01 @1200 -> 3*1200=3600. c2 holds 2 units (4-2), last c2
// snapshot on/before that date is 2026-03-01 @700 -> 2*700=1400. Total 5000.
// Note this deliberately does NOT equal groundTruthValue (5100, using
// TODAY's cards.current_price) — the two numbers answer different
// questions (historical evaluation vs current live value) and must NOT be
// expected to match; asserting the exact, independently-hand-calculated
// value here is what actually proves the snapshot-lookup logic, not a
// coincidental equality with the dashboard's number.
assertEqual(lastPoint.value, 3 * 1200 + 2 * 700, "history's last point value matches independent hand calculation using only price_snapshots as of that date");

// Codex independent review (2026-09-13): dashboardSummary.ts and
// holdingsBreakdown.ts were fixed independently (same day, separate call
// sites) to stop treating a null current_price as a fabricated 0 — this
// section proves the two agree with each other on a shared scenario, not
// just each with their own unit tests. c1 has a known price; c2's
// current_price is null (e.g. added to the catalog before its first price
// scrape). Both modules must exclude c2 from any evaluated-value total
// while still accounting for it as "held" (holdingsCount / cardCount /
// quantity), and must agree on the exact value contributed by c1 alone.
{
  const cardsWithUnpriced = [
    { id: "c1", name: "c1", rarity: "SR", set_name: "setX", current_price: 1300, pct_vs_avg30: 10, data_quality: "real", source_url: "x" },
    { id: "c2", name: "c2", rarity: "R", set_name: "setX", current_price: null, pct_vs_avg30: null, data_quality: "real", source_url: "x" },
  ];
  const pnl2 = computePnl(transactions);
  const summary2 = buildDashboardSummary(transactions, [], cardsWithUnpriced);
  const breakdown2 = buildHoldingsBreakdown(pnl2.holdings, cardsWithUnpriced);

  const c1Holding = pnl2.holdings.find((h) => h.cardId === "c1");
  const expectedC1Value = 1300 * c1Holding.quantity; // 1300 * 3 = 3900

  assertEqual(summary2.currentValue, expectedC1Value, "dashboard currentValue counts only c1 (known price), excluding c2 (null)");
  assertEqual(summary2.unpricedHoldingsCount, 1, "dashboard flags exactly 1 unpriced holding (c2)");

  const totalBreakdownValue = breakdown2.byRarity.reduce((sum, g) => sum + g.value, 0);
  assertEqual(totalBreakdownValue, expectedC1Value, "holdingsBreakdown's total value across rarity groups agrees with dashboard's currentValue (both exclude c2)");
  const rGroup = breakdown2.byRarity.find((g) => g.label === "R");
  assertEqual(rGroup.hasUnknownValue, true, "holdingsBreakdown flags the R group (c2) as having an unknown value, not a silent 0");
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exitCode = 1;
