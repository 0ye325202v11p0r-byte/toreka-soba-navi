// Regression test for src/lib/priceRecord.ts's computePriceRecord() and
// src/lib/priceRecordUpdate.ts's resolvePriceRecord() — "史上最高値・最安値
//更新" (added 2026-09-13, differentiation feature #6).
//
// Run: node --experimental-strip-types migration/verify_price_record.mjs
import { register } from "node:module";
register("./_test_mocks/loader.mjs", import.meta.url);

const { computePriceRecord } = await import("../src/lib/priceRecord.ts");
const { resolvePriceRecord } = await import("../src/lib/priceRecordUpdate.ts");

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

// ---- computePriceRecord ----

// T1: both priors known, new price beats the high.
assertEqual(
  computePriceRecord(150, 120, 80),
  { status: "high", newHigh: 150, newLow: 80 },
  "T1: strictly beating the known high reports status=high and keeps the known low"
);

// T2: both priors known, new price beats the low.
assertEqual(
  computePriceRecord(50, 120, 80),
  { status: "low", newHigh: 120, newLow: 50 },
  "T2: strictly beating the known low reports status=low and keeps the known high"
);

// T3: new price ties the high exactly — not a NEW record.
assertEqual(
  computePriceRecord(120, 120, 80),
  { status: null, newHigh: 120, newLow: 80 },
  "T3: tying the existing high is not a new record (strict > only)"
);

// T4: new price ties the low exactly — not a NEW record.
assertEqual(
  computePriceRecord(80, 120, 80),
  { status: null, newHigh: 120, newLow: 80 },
  "T4: tying the existing low is not a new record (strict < only)"
);

// T5: new price strictly between the two — no record either way.
assertEqual(
  computePriceRecord(100, 120, 80),
  { status: null, newHigh: 120, newLow: 80 },
  "T5: a price strictly inside the known range is not a record"
);

// T6: first-ever sighting (both priors null) — always reports "high",
// seeding both newHigh and newLow to the same first price.
assertEqual(
  computePriceRecord(100, null, null),
  { status: "high", newHigh: 100, newLow: 100 },
  "T6: first-ever sighting seeds both high and low to the same price"
);

console.log(`\n(computePriceRecord) ${pass} passed, ${fail} failed so far`);

// ---- resolvePriceRecord ----

// T7: both priors already known -> the fetcher must NOT be called at all
// (the whole point of the incremental design is avoiding a full-history
// query on every run, only on a card's first sighting).
{
  let calls = 0;
  const fetcher = { async fetchAllPrices() { calls++; return []; } };
  const result = await resolvePriceRecord(fetcher, "c1", 150, 120, 80);
  assertEqual(calls, 0, "T7: fast path never calls fetchAllPrices when both priors are already known");
  assertEqual(result, { status: "high", newHigh: 150, newLow: 80 }, "T7: fast path still computes the correct record");
}

// T8: both priors null -> fetcher is consulted, seeding high/low from the
// full history it returns (currentPrice itself is assumed already included
// in that history, same as the real card_id-scoped price_snapshots read).
{
  const fetcher = { async fetchAllPrices() { return [100, 130, 90, 150]; } };
  const result = await resolvePriceRecord(fetcher, "c1", 150, null, null);
  assertEqual(
    result,
    { status: null, newHigh: 150, newLow: 90 },
    "T8: seeded from full history — currentPrice (150) ties the freshly-seeded max, so it's NOT a false 'new record' on backfill day"
  );
}

// T9: only one prior is null (partially backfilled — shouldn't happen in
// practice since both are always written together, but the function must
// still degrade sensibly) -> only the missing side is seeded from history.
{
  const fetcher = { async fetchAllPrices() { return [100, 130, 90]; } };
  const result = await resolvePriceRecord(fetcher, "c1", 140, null, 80);
  assertEqual(
    result,
    { status: "high", newHigh: 140, newLow: 80 },
    "T9: only the null side (high) is seeded from history; the already-known low (80) is left untouched"
  );
}

// T10: fetcher returns no history at all (e.g. a brand new card with zero
// price_snapshots rows yet, or a transient read failure) -> fails open to
// "no known priors", same as computePriceRecord's first-ever-sighting case,
// rather than throwing or fabricating a record.
{
  const fetcher = { async fetchAllPrices() { return []; } };
  const result = await resolvePriceRecord(fetcher, "c1", 100, null, null);
  assertEqual(
    result,
    { status: "high", newHigh: 100, newLow: 100 },
    "T10: empty history from the fetcher degrades to the same first-ever-sighting behavior as computePriceRecord"
  );
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exitCode = 1;
