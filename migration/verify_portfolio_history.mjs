// Regression test for src/lib/portfolioHistory.ts's
// buildPortfolioValueHistory() — the "評価額の推移" chart behind
// /portfolio (added 2026-09-13). Imports the REAL implementation (which
// itself calls the real computePnl()), not a hand-copied reimplementation.
//
// Uses the shared test-loader hook (see _test_mocks/loader.mjs) the same
// way verify_dashboard_summary.mjs does, since portfolioHistory.ts imports
// its sibling ./pnl module via an extensionless relative path — plain Node
// ESM resolution can't follow that on its own.
//
// Run: node --experimental-strip-types migration/verify_portfolio_history.mjs
import { register } from "node:module";
register("./_test_mocks/loader.mjs", import.meta.url);
const { buildPortfolioValueHistory } = await import("../src/lib/portfolioHistory.ts");

let pass = 0;
let fail = 0;
function assertEqual(actual, expected, label) {
  const ok = typeof expected === "number" ? Math.abs(actual - expected) < 0.01 : actual === expected;
  if (ok) pass++;
  else {
    fail++;
    console.error(`FAIL: ${label} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
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

// T1: no transactions at all — empty history, not a crash.
{
  const points = buildPortfolioValueHistory([], new Map());
  assertEqual(points.length, 0, "T1 no transactions produces no points");
}

// T2: a realistic two-purchase timeline for one card, with price rising
// between the two evaluation dates — this is the actual "did my portfolio
// grow" story the feature exists to tell.
{
  const transactions = [
    txn("c1", "buy", 2, 1000, "2026-01-01"),
    txn("c1", "buy", 1, 1200, "2026-02-01"),
  ];
  const snapshotsByCard = new Map([
    ["c1", [snap("c1", "2026-01-01", 1000), snap("c1", "2026-02-01", 1200)]],
  ]);
  const points = buildPortfolioValueHistory(transactions, snapshotsByCard);
  assertEqual(points.length, 2, "T2 two distinct transaction dates produce two points");
  assertEqual(points[0].date, "2026-01-01", "T2 first point is the first transaction date");
  assertEqual(points[0].value, 2000, "T2 first point: 2 units held @1000 = 2000");
  assertEqual(points[1].date, "2026-02-01", "T2 second point is the second transaction date");
  assertEqual(points[1].value, 3 * 1200, "T2 second point: 3 units held (2+1) @1200 = 3600");
}

// T3: a sell reduces the evaluated holdings from that date onward — the
// chart must reflect that the portfolio got smaller, not keep valuing
// units that were already sold.
{
  const transactions = [
    txn("c1", "buy", 3, 1000, "2026-01-01"),
    txn("c1", "sell", 1, 1500, "2026-03-01"),
  ];
  const snapshotsByCard = new Map([
    ["c1", [snap("c1", "2026-01-01", 1000), snap("c1", "2026-03-01", 1500)]],
  ]);
  const points = buildPortfolioValueHistory(transactions, snapshotsByCard);
  assertEqual(points[1].value, 2 * 1500, "T3 after selling 1 of 3, only 2 remain (2*1500), not 3");
}

// T4: a card with NO price data at all as of an evaluation date is
// excluded from that point's total rather than silently valued at 0 —
// missing data must never look like a loss.
{
  const transactions = [
    txn("c1", "buy", 2, 1000, "2026-01-01"),
    txn("c2", "buy", 1, 500, "2026-01-01"), // c2 has no snapshot data at all
  ];
  const snapshotsByCard = new Map([["c1", [snap("c1", "2026-01-01", 1000)]]]);
  const points = buildPortfolioValueHistory(transactions, snapshotsByCard);
  assertEqual(points[0].value, 2000, "T4 c2 (no price data) contributes 0, not a fabricated value — total is just c1's 2000");
}

// T5: priceOnOrBefore uses the LATEST snapshot at or before the evaluation
// date, not the nearest overall (never looks into the future) — this
// matters for sparse-history cards (yuyu-tei-sourced, weeks between
// updates) where the most recent past price is the honest answer, not an
// average or a future price that hadn't happened yet.
{
  const transactions = [txn("c1", "buy", 1, 1000, "2026-01-10")];
  const snapshotsByCard = new Map([
    [
      "c1",
      [
        snap("c1", "2026-01-01", 900), // before the eval date — should be picked
        snap("c1", "2026-01-20", 1100), // after the eval date — must NOT be used
      ],
    ],
  ]);
  const points = buildPortfolioValueHistory(transactions, snapshotsByCard);
  assertEqual(points[0].value, 900, "T5 uses the last snapshot ON OR BEFORE the evaluation date, never a future one");
}

// T6: multiple points stay in chronological (ascending date) order.
{
  const transactions = [
    txn("c1", "buy", 1, 100, "2026-03-01"),
    txn("c1", "buy", 1, 100, "2026-01-01"),
    txn("c1", "buy", 1, 100, "2026-02-01"),
  ];
  const snapshotsByCard = new Map([
    ["c1", [snap("c1", "2026-01-01", 100), snap("c1", "2026-02-01", 100), snap("c1", "2026-03-01", 100)]],
  ]);
  const points = buildPortfolioValueHistory(transactions, snapshotsByCard);
  assertEqual(points.map((p) => p.date).join(","), "2026-01-01,2026-02-01,2026-03-01", "T6 points are sorted ascending by date regardless of input transaction order");
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exitCode = 1;
