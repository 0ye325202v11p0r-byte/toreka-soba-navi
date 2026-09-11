// Manual verification of the FIFO P&L logic in src/lib/pnl.ts using hand-
// calculated expected values. Not a full test suite (no framework added to
// keep dependencies minimal), but enough to catch a logic regression before
// it reaches real users' money-adjacent numbers.
//
// Imports the REAL src/lib/pnl.ts (not a hand-copied reimplementation —
// that was the original approach here, but an independent review
// (2026-09-11) correctly pointed out a copy can silently drift from the
// real implementation and this test would then verify nothing real).
// Requires Node's type-stripping ESM loader (available unflagged as of
// Node 24 for this file's plain type-only annotations — no enums/
// decorators/namespaces): `node --experimental-strip-types
// migration/verify_pnl_logic.mjs`. A MODULE_TYPELESS_PACKAGE_JSON warning
// on stderr is expected and harmless (this project's package.json has no
// "type" field); it does not affect the exit code or test results.
import { computePnl } from "../src/lib/pnl.ts";

function assertEqual(actual, expected, label) {
  const ok =
    typeof expected === "number" ? Math.abs(actual - expected) < 0.01 : actual === expected;
  console.log(`${ok ? "PASS" : "FAIL"} ${label}: expected ${expected}, got ${actual}`);
  if (!ok) process.exitCode = 1;
}

// --- Test 1: simple buy, no sell ---
// Buy 3 @ 1000. Expect: holding qty=3, costBasis=3000, realized=0
{
  const result = computePnl([
    { card_id: "c1", type: "buy", quantity: 3, price_per_unit: 1000, transaction_date: "2026-01-01", created_at: "2026-01-01T00:00:00Z" },
  ]);
  assertEqual(result.holdings[0].quantity, 3, "T1 holding qty");
  assertEqual(result.holdings[0].costBasis, 3000, "T1 cost basis");
  assertEqual(result.realizedPnl, 0, "T1 realized pnl");
}

// --- Test 2: buy then sell all at a profit ---
// Buy 2 @ 1000 (2000 total), sell 2 @ 1500 (3000 total). Realized = 1000, no holdings.
{
  const result = computePnl([
    { card_id: "c1", type: "buy", quantity: 2, price_per_unit: 1000, transaction_date: "2026-01-01", created_at: "2026-01-01T00:00:00Z" },
    { card_id: "c1", type: "sell", quantity: 2, price_per_unit: 1500, transaction_date: "2026-02-01", created_at: "2026-02-01T00:00:00Z" },
  ]);
  assertEqual(result.holdings.length, 0, "T2 no holdings remain");
  assertEqual(result.realizedPnl, 1000, "T2 realized profit");
}

// --- Test 3: FIFO ordering across two buy lots at different prices ---
// Buy 2 @ 1000 (lot A), buy 2 @ 2000 (lot B), sell 3 @ 1800.
// FIFO consumes lot A first (2 units @1000) then 1 unit from lot B (@2000).
// Realized = 2*(1800-1000) + 1*(1800-2000) = 1600 - 200 = 1400
// Remaining holding: 1 unit from lot B @ 2000 cost basis
{
  const result = computePnl([
    { card_id: "c1", type: "buy", quantity: 2, price_per_unit: 1000, transaction_date: "2026-01-01", created_at: "2026-01-01T00:00:00Z" },
    { card_id: "c1", type: "buy", quantity: 2, price_per_unit: 2000, transaction_date: "2026-01-15", created_at: "2026-01-15T00:00:00Z" },
    { card_id: "c1", type: "sell", quantity: 3, price_per_unit: 1800, transaction_date: "2026-02-01", created_at: "2026-02-01T00:00:00Z" },
  ]);
  assertEqual(result.realizedPnl, 1400, "T3 FIFO realized pnl");
  assertEqual(result.holdings[0].quantity, 1, "T3 remaining qty");
  assertEqual(result.holdings[0].costBasis, 2000, "T3 remaining cost basis (from the 2nd lot)");
}

// --- Test 4: multiple cards don't interfere with each other ---
{
  const result = computePnl([
    { card_id: "c1", type: "buy", quantity: 1, price_per_unit: 100, transaction_date: "2026-01-01", created_at: "2026-01-01T00:00:00Z" },
    { card_id: "c2", type: "buy", quantity: 1, price_per_unit: 500, transaction_date: "2026-01-01", created_at: "2026-01-01T00:00:00Z" },
    { card_id: "c2", type: "sell", quantity: 1, price_per_unit: 600, transaction_date: "2026-01-02", created_at: "2026-01-02T00:00:00Z" },
  ]);
  assertEqual(result.holdings.length, 1, "T4 only c1 remains held");
  assertEqual(result.holdings[0].cardId, "c1", "T4 correct card held");
  assertEqual(result.realizedPnl, 100, "T4 realized pnl only from c2");
}

// --- Test 5: overselling (more sold than ever bought) doesn't crash or
// fabricate a cost basis for the excess ---
{
  const result = computePnl([
    { card_id: "c1", type: "buy", quantity: 1, price_per_unit: 1000, transaction_date: "2026-01-01", created_at: "2026-01-01T00:00:00Z" },
    { card_id: "c1", type: "sell", quantity: 5, price_per_unit: 1200, transaction_date: "2026-01-02", created_at: "2026-01-02T00:00:00Z" },
  ]);
  // only 1 unit has a real cost basis to realize against
  assertEqual(result.realizedPnl, 200, "T5 oversell only realizes the covered portion");
  assertEqual(result.holdings.length, 0, "T5 no negative holdings");
}

console.log("\nAll pnl.ts logic checks completed.");
