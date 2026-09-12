// Regression test for src/lib/transactionsCsv.ts's buildTransactionsCsv()
// — the CSV export behind PortfolioClient.tsx's "取引履歴をCSVで保存"
// button (added 2026-09-13). Imports the REAL implementation.
//
// Run: node --experimental-strip-types migration/verify_transactions_csv.mjs
import { buildTransactionsCsv } from "../src/lib/transactionsCsv.ts";

let pass = 0;
let fail = 0;
function assertEqual(actual, expected, label) {
  const ok = actual === expected;
  if (ok) pass++;
  else {
    fail++;
    console.error(`FAIL: ${label}\n  expected: ${JSON.stringify(expected)}\n  got:      ${JSON.stringify(actual)}`);
  }
}

function row(overrides = {}) {
  return {
    transaction_date: "2026-01-15",
    type: "buy",
    card_id: "c1",
    card_name: "モンキー・D・ルフィ",
    quantity: 2,
    price_per_unit: 1000,
    fee: 0,
    ...overrides,
  };
}

// T1: header row is always present, even with zero transactions.
{
  const csv = buildTransactionsCsv([]);
  assertEqual(csv, "取引日,種別,カードID,カード名,数量,単価,手数料,合計金額", "T1 empty input still produces just the header row");
}

// T2: a plain buy row, no fee — total is quantity*price_per_unit.
{
  const csv = buildTransactionsCsv([row()]);
  const lines = csv.split("\r\n");
  assertEqual(lines.length, 2, "T2 one data row plus the header");
  assertEqual(lines[1], "2026-01-15,購入,c1,モンキー・D・ルフィ,2,1000,0,2000", "T2 buy total with no fee is quantity*price_per_unit");
}

// T3: a sell row with a fee — total is quantity*price_per_unit MINUS fee,
// matching src/lib/pnl.ts's own effective-proceeds calculation (so this
// CSV and the in-app 実現損益 numbers reconcile against each other).
{
  const csv = buildTransactionsCsv([row({ type: "sell", price_per_unit: 1500, fee: 100 })]);
  const lines = csv.split("\r\n");
  assertEqual(lines[1], "2026-01-15,売却,c1,モンキー・D・ルフィ,2,1500,100,2900", "T3 sell total subtracts the fee (2*1500-100)");
}

// T4: a buy row with a fee — total is quantity*price_per_unit PLUS fee.
{
  const csv = buildTransactionsCsv([row({ fee: 100 })]);
  const lines = csv.split("\r\n");
  assertEqual(lines[1], "2026-01-15,購入,c1,モンキー・D・ルフィ,2,1000,0,2000".replace(",0,2000", ",100,2100"), "T4 buy total adds the fee (2*1000+100)");
}

// T5: a card name containing a comma must be quoted (RFC 4180) — otherwise
// it would silently split into extra spreadsheet columns.
{
  const csv = buildTransactionsCsv([row({ card_name: "ルフィ, ギア5" })]);
  const lines = csv.split("\r\n");
  assertEqual(lines[1].includes('"ルフィ, ギア5"'), true, "T5 a comma in the card name is wrapped in double quotes");
}

// T6: a card name containing a literal double quote must have it doubled,
// per RFC 4180, inside the wrapping quotes.
{
  const csv = buildTransactionsCsv([row({ card_name: 'ルフィ"最強"' })]);
  const lines = csv.split("\r\n");
  assertEqual(lines[1].includes('"ルフィ""最強"""'), true, 'T6 an internal double quote is doubled and the whole field quoted');
}

// T7: a card_id itself could in principle need escaping too (defensive —
// not expected in practice, since ids are app-generated, but the function
// must not special-case one column and forget another).
{
  const csv = buildTransactionsCsv([row({ card_id: "c,1" })]);
  const lines = csv.split("\r\n");
  assertEqual(lines[1].includes(',"c,1",'), true, "T7 a comma in card_id is also quoted, not just card_name");
}

// T8: multiple rows preserve input order (no implicit re-sorting) and each
// gets its own correctly-terminated line.
{
  const csv = buildTransactionsCsv([
    row({ card_id: "c1" }),
    row({ card_id: "c2", type: "sell", price_per_unit: 900 }),
  ]);
  const lines = csv.split("\r\n");
  assertEqual(lines.length, 3, "T8 header + 2 data rows");
  assertEqual(lines[1].startsWith("2026-01-15,購入,c1,"), true, "T8 first row is the buy for c1");
  assertEqual(lines[2].startsWith("2026-01-15,売却,c2,"), true, "T8 second row is the sell for c2, in the given order");
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exitCode = 1;
