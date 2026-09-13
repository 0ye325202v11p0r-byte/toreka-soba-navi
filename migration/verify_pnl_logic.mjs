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

// --- Test 6: same-day tiebreak uses created_at, not input array order ---
// Two buys share the same transaction_date. Buy A (qty 2 @1000) is listed
// FIRST in the input array but has the LATER created_at (10:00). Buy B
// (qty 2 @2000) is listed second but has the EARLIER created_at (09:00).
// Correct FIFO (sorted by transaction_date, then created_at) must consume
// B's lot first despite its later array position — a naive implementation
// that only sorts by transaction_date (a stable sort leaving same-date
// entries in original array order) would consume A first instead, giving
// a different, wrong answer. Sell 2 @1800:
//   correct (B first):  realized = 2*(1800-2000) = -400, A's lot remains
//   wrong (A first):     realized = 2*(1800-1000) = +1600, B's lot remains
// This case (2026-09-12, independent review follow-up) was previously
// untested — only Test 3 exercised multi-lot FIFO, and its two buys have
// distinct transaction_dates, so it never exercised the created_at
// tiebreak path at all.
{
  const result = computePnl([
    { card_id: "c1", type: "buy", quantity: 2, price_per_unit: 1000, transaction_date: "2026-01-01", created_at: "2026-01-01T10:00:00Z" }, // listed first, created LATER
    { card_id: "c1", type: "buy", quantity: 2, price_per_unit: 2000, transaction_date: "2026-01-01", created_at: "2026-01-01T09:00:00Z" }, // listed second, created EARLIER
    { card_id: "c1", type: "sell", quantity: 2, price_per_unit: 1800, transaction_date: "2026-01-02", created_at: "2026-01-02T00:00:00Z" },
  ]);
  assertEqual(result.realizedPnl, -400, "T6 same-day tiebreak: created_at (not array order) decides FIFO order");
  assertEqual(result.holdings[0].quantity, 2, "T6 remaining qty is the later-created (1000-cost) lot");
  assertEqual(result.holdings[0].costBasis, 2000, "T6 remaining cost basis is 2 units @1000, not @2000");
}

// --- Test 7: computePnl does not mutate its input ---
// Server Components / callers may reuse the same transactions array/objects
// after calling computePnl (e.g. passing it to something else, or React
// re-rendering with the same props) — a function that mutates its lot
// tracking in place on the caller's own objects (rather than local copies)
// would corrupt that data for any subsequent use. Verified via deep
// equality (JSON) of the input before/after, on a case that includes a
// partially-consumed lot (Test 3's scenario) — the most likely place an
// in-place `lot.quantity -=` mutation would leak onto a shared object if
// the implementation ever stopped copying into fresh Lot objects.
{
  const input = [
    { card_id: "c1", type: "buy", quantity: 2, price_per_unit: 1000, transaction_date: "2026-01-01", created_at: "2026-01-01T00:00:00Z" },
    { card_id: "c1", type: "buy", quantity: 2, price_per_unit: 2000, transaction_date: "2026-01-15", created_at: "2026-01-15T00:00:00Z" },
    { card_id: "c1", type: "sell", quantity: 3, price_per_unit: 1800, transaction_date: "2026-02-01", created_at: "2026-02-01T00:00:00Z" },
  ];
  const before = JSON.stringify(input);
  const inputLengthBefore = input.length;
  computePnl(input);
  const after = JSON.stringify(input);
  assertEqual(after === before, true, "T7 input array/objects are byte-for-byte unchanged after computePnl");
  assertEqual(input.length, inputLengthBefore, "T7 input array length is unchanged (no push/shift/splice)");
}

// --- Test 8: fee raises the effective cost basis on a buy (2026-09-13) ---
// Buy 2 @ 1000 with a 100 total fee. Effective cost = (2*1000+100)/2 = 1050
// per unit, so cost basis = 2100, not 2000 — the FIFO calc previously
// ignored fees entirely, so 含み損益 never reflected what actually left
// the user's pocket on a purchase.
{
  const result = computePnl([
    { card_id: "c1", type: "buy", quantity: 2, price_per_unit: 1000, fee: 100, transaction_date: "2026-01-01", created_at: "2026-01-01T00:00:00Z" },
  ]);
  assertEqual(result.holdings[0].costBasis, 2100, "T8 buy fee raises cost basis (2000 + 100 fee)");
  assertEqual(result.holdings[0].avgCost, 1050, "T8 buy fee raises avgCost per unit (2100/2)");
}

// --- Test 9: fee lowers the effective proceeds on a sell (2026-09-13) ---
// Buy 2 @ 1000 (no fee), sell 2 @ 1500 with a 100 total fee. Effective
// proceeds = (2*1500-100)/2 = 1450/unit. Realized = 2*(1450-1000) = 900,
// not the fee-blind 1000 from Test 2's identical prices with no fee.
{
  const result = computePnl([
    { card_id: "c1", type: "buy", quantity: 2, price_per_unit: 1000, fee: 0, transaction_date: "2026-01-01", created_at: "2026-01-01T00:00:00Z" },
    { card_id: "c1", type: "sell", quantity: 2, price_per_unit: 1500, fee: 100, transaction_date: "2026-02-01", created_at: "2026-02-01T00:00:00Z" },
  ]);
  assertEqual(result.realizedPnl, 900, "T9 sell fee lowers realized profit (1000 fee-blind minus the 100 fee)");
}

// --- Test 10: a transaction with no fee field at all (recorded before this
// column existed) behaves identically to fee=0 — backward compatibility
// for every transaction already in the database (2026-09-13). ---
{
  const withoutFeeField = computePnl([
    { card_id: "c1", type: "buy", quantity: 2, price_per_unit: 1000, transaction_date: "2026-01-01", created_at: "2026-01-01T00:00:00Z" },
  ]);
  const withExplicitZeroFee = computePnl([
    { card_id: "c1", type: "buy", quantity: 2, price_per_unit: 1000, fee: 0, transaction_date: "2026-01-01", created_at: "2026-01-01T00:00:00Z" },
  ]);
  assertEqual(withoutFeeField.holdings[0].costBasis, withExplicitZeroFee.holdings[0].costBasis, "T10 missing fee field == explicit fee:0");
  assertEqual(withoutFeeField.holdings[0].costBasis, 2000, "T10 cost basis with no fee is the plain quantity*price");
}

// --- Test 11 (2026-09-13, annual realized-P&L report feature): a single
// sell produces exactly one realizedEvent, with the correct date/quantity/
// gain — the per-transaction detail behind the aggregate realizedPnl. ---
{
  const result = computePnl([
    { card_id: "c1", type: "buy", quantity: 2, price_per_unit: 1000, transaction_date: "2026-01-01", created_at: "2026-01-01T00:00:00Z" },
    { card_id: "c1", type: "sell", quantity: 2, price_per_unit: 1500, transaction_date: "2026-03-15", created_at: "2026-03-15T00:00:00Z" },
  ]);
  assertEqual(result.realizedEvents.length, 1, "T11 exactly one realizedEvent for one sell transaction");
  assertEqual(result.realizedEvents[0].cardId, "c1", "T11 realizedEvent names the correct card");
  assertEqual(result.realizedEvents[0].date, "2026-03-15", "T11 realizedEvent uses the sell's own transaction_date");
  assertEqual(result.realizedEvents[0].quantity, 2, "T11 realizedEvent quantity matches the sell");
  assertEqual(result.realizedEvents[0].gain, 1000, "T11 realizedEvent gain matches the aggregate realizedPnl for this single sell");
}

// --- Test 12: a sell that spans TWO buy lots (FIFO crosses a lot boundary)
// must still produce exactly ONE realizedEvent (one line per sell
// transaction, not one per lot consumed) — a user recognizes their own
// sell transactions, not this app's internal lot bookkeeping. ---
{
  const result = computePnl([
    { card_id: "c1", type: "buy", quantity: 1, price_per_unit: 1000, transaction_date: "2026-01-01", created_at: "2026-01-01T00:00:00Z" },
    { card_id: "c1", type: "buy", quantity: 1, price_per_unit: 2000, transaction_date: "2026-02-01", created_at: "2026-02-01T00:00:00Z" },
    { card_id: "c1", type: "sell", quantity: 2, price_per_unit: 1800, transaction_date: "2026-03-01", created_at: "2026-03-01T00:00:00Z" },
  ]);
  // gain = (1800-1000) + (1800-2000) = 800 - 200 = 600
  assertEqual(result.realizedEvents.length, 1, "T12 one sell spanning two lots is still exactly one realizedEvent");
  assertEqual(result.realizedEvents[0].gain, 600, "T12 the single event's gain combines both consumed lots correctly");
}

// --- Test 13: multiple sells across different cards/dates each produce
// their own realizedEvent, and buys never produce one at all. ---
{
  const result = computePnl([
    { card_id: "c1", type: "buy", quantity: 1, price_per_unit: 1000, transaction_date: "2026-01-01", created_at: "2026-01-01T00:00:00Z" },
    { card_id: "c1", type: "sell", quantity: 1, price_per_unit: 1200, transaction_date: "2026-01-10", created_at: "2026-01-10T00:00:00Z" },
    { card_id: "c2", type: "buy", quantity: 1, price_per_unit: 500, transaction_date: "2026-02-01", created_at: "2026-02-01T00:00:00Z" },
    { card_id: "c2", type: "sell", quantity: 1, price_per_unit: 400, transaction_date: "2026-02-15", created_at: "2026-02-15T00:00:00Z" },
  ]);
  assertEqual(result.realizedEvents.length, 2, "T13 two sells across two cards produce exactly two realizedEvents (buys never produce one)");
  const totalFromEvents = result.realizedEvents.reduce((s, e) => s + e.gain, 0);
  assertEqual(totalFromEvents, result.realizedPnl, "T13 summing all realizedEvents' gains equals the aggregate realizedPnl exactly");
}

console.log("\nAll pnl.ts logic checks completed.");
