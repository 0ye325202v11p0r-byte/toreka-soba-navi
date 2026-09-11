// Regression test for bugs found by independent review (2026-09-12) in
// src/app/api/cron/check-watchlist/route.ts:
//
// 1. alert_rule is untyped JSONB — a single row with a malformed/null value
//    (JSON null is valid JSONB) reached conditionMet() with no per-item
//    isolation and threw, taking down the whole run over one bad row from
//    any single user. Fixed by isValidAlertRule() validating before use.
// 2. Per-call DB timeouts (10s) don't bound the total run time — enough
//    triggered items updated sequentially could add up past
//    maxDuration=60s. Fixed by an overall TIME_BUDGET_MS guard mirroring
//    the one already regression-tested for refresh-prices/route.ts.
// 3. [re-review, 2026-09-12] The #2 fix only guarded the per-item
//    processing loop, not the two READ loops before it (watchlist_items
//    pagination, cards .in() chunking) — a large enough table/id-set could
//    burn the whole maxDuration just reading, before the processing loop's
//    own check ever runs. Fixed by checking the budget before each read
//    call too, returning `{incomplete: true, phase}` immediately (no
//    further DB call of any kind) on a mid-read timeout, rather than
//    silently proceeding with a partial list while still reporting
//    totalItems/success as if everything had been read.
//
// Like verify_cron_time_budget.mjs, this imports the REAL GET() handler
// (not a hand-copied reproduction) via the same Node module loader hook,
// with the Supabase client and Date.now() mocked. No real network or
// database calls — including no calls against the real Supabase project,
// not even read-only ones (an earlier pass in this session ran the fixed
// route against production data over localhost as a sanity check; per
// follow-up review feedback, verification going forward is mock-only).
//
// Run: node --experimental-strip-types migration/verify_check_watchlist.mjs
import { register } from "node:module";

register("./_test_mocks/loader.mjs", import.meta.url);

process.env.CRON_SECRET = "test-secret";
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.invalid";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";

// ---- virtual clock ----
let virtualNow = 1_000_000_000;
Date.now = () => virtualNow;
function advance(ms) {
  virtualNow += ms;
}

// ---- Supabase mock ----
// allItems/allCards are full backing arrays (can exceed 1000, to exercise
// pagination/chunking). watchlistPageAdvanceMs/cardsChunkAdvanceMs simulate
// how long each individual page/chunk read "takes"; call counters let
// scenarios assert a page/chunk was never attempted after a timeout.
function makeSupabaseMock({
  allItems = [],
  allCards = [],
  watchlistPageAdvanceMs = 0,
  cardsChunkAdvanceMs = 0,
  updateAdvanceMs = 0,
  updateShouldFail = () => false,
}) {
  const calls = { watchlistPages: 0, cardsChunks: 0, updates: 0 };
  const mock = {
    from(table) {
      if (table === "watchlist_items") {
        return {
          select: () => ({
            order: () => ({
              range: (from, to) => ({
                abortSignal: () =>
                  (async () => {
                    calls.watchlistPages++;
                    advance(watchlistPageAdvanceMs);
                    return { data: allItems.slice(from, to + 1), error: null };
                  })(),
              }),
            }),
          }),
          update: () => {
            const built = {
              eq(_col, id) {
                this._id = id;
                return this;
              },
              abortSignal: () =>
                (async () => {
                  calls.updates++;
                  advance(updateAdvanceMs);
                  if (updateShouldFail(built._id)) return { error: { message: "mock update failure" } };
                  return { error: null };
                })(),
            };
            return built;
          },
        };
      }
      if (table === "cards") {
        return {
          select: () => ({
            in: (_col, ids) => ({
              abortSignal: () =>
                (async () => {
                  calls.cardsChunks++;
                  advance(cardsChunkAdvanceMs);
                  const set = new Set(ids);
                  return { data: allCards.filter((c) => set.has(c.id)), error: null };
                })(),
            }),
          }),
        };
      }
      throw new Error(`verify_check_watchlist: unexpected table "${table}"`);
    },
  };
  return { mock, calls };
}

const { GET } = await import("../src/app/api/cron/check-watchlist/route.ts");

async function run(label, opts) {
  virtualNow = 1_000_000_000;
  const { mock, calls } = makeSupabaseMock(opts);
  globalThis.__SUPABASE_MOCK__ = mock;
  const request = new Request("http://localhost/api/cron/check-watchlist", {
    headers: { Authorization: "Bearer test-secret" },
  });
  let body, status, threw;
  try {
    const res = await GET(request);
    status = res.status;
    body = await res.json();
  } catch (err) {
    threw = err;
  }
  console.log(`\n--- ${label} ---`);
  if (threw) {
    console.log(`THREW: ${threw.stack}`);
  } else {
    console.log(`status=${status} body=${JSON.stringify(body)} calls=${JSON.stringify(calls)}`);
  }
  return { body, status, threw, calls };
}

let pass = 0;
let fail = 0;
function assert(cond, label) {
  if (cond) {
    pass++;
  } else {
    fail++;
    console.error(`FAIL: ${label}`);
  }
}

const oneCard = [{ id: "c1", pct_vs_avg30: null, current_price: 600 }];

// Scenario 1: one item has a malformed alert_rule (null), one is a valid
// rule that's currently met, one is a valid rule that isn't met. Before the
// fix, item order matters (a null rule anywhere in the list crashes the
// whole run) — this places the bad row in the MIDDLE so a fix that merely
// short-circuited on the first item wouldn't be caught by accident.
{
  const allItems = [
    { id: "w1", card_id: "c1", alert_rule: { type: "price", op: "lte", value: 999999 } }, // met
    { id: "w2", card_id: "c1", alert_rule: null }, // malformed — the bug trigger
    { id: "w3", card_id: "c1", alert_rule: { type: "price", op: "lte", value: 1 } }, // not met
  ];
  const { body, status, threw } = await run("malformed alert_rule (null) among valid items", {
    allItems,
    allCards: oneCard,
  });
  assert(!threw, "S1: GET must not throw on a malformed alert_rule row");
  assert(status === 200, "S1: response status is 200, not a 500 from an uncaught exception");
  assert(body?.invalidRule === 1, "S1: the malformed row is counted as invalidRule, not silently dropped or crashing");
  assert(body?.triggered === 1, "S1: the valid, matching item (w1) still triggers");
  assert(body?.totalItems === 3, "S1: totalItems reflects all rows read, including the malformed one");
}

// Scenario 2: a malformed rule that's an object but with garbage field
// values (wrong type/op/value types) rather than JSON null.
{
  const allItems = [
    { id: "w1", card_id: "c1", alert_rule: { type: "not_a_real_type", op: "lte", value: 1 } },
    { id: "w2", card_id: "c1", alert_rule: { type: "price", op: "not_a_real_op", value: 1 } },
    { id: "w3", card_id: "c1", alert_rule: { type: "price", op: "lte", value: "not-a-number" } },
    { id: "w4", card_id: "c1", alert_rule: "just a string" },
  ];
  const { body, threw } = await run("various malformed alert_rule shapes", { allItems, allCards: oneCard });
  assert(!threw, "S2: GET must not throw on any malformed shape");
  assert(body?.invalidRule === 4, "S2: all four malformed rows are rejected by isValidAlertRule");
  assert(body?.triggered === 0, "S2: nothing triggers from malformed rows");
}

// Scenario 3: overall processing-loop time budget — many triggering items,
// each update call costs enough virtual time that the cumulative total
// exceeds TIME_BUDGET_MS (45_000) partway through. The loop must stop and
// report skippedForTime, rather than running unboundedly past the budget.
// 3 updates @ 20_000ms = 60_000ms > 45_000, so the budget trips on the 4th
// item's pre-check — 3 triggered, 7 skipped (not "2 triggered": the
// previous version of this comment claimed 2, which was a miscalculation
// caught on re-review; the code and the assertions below were always
// correct, only the prose was wrong).
{
  const N = 10;
  const allItems = Array.from({ length: N }, (_, i) => ({
    id: `w${i}`,
    card_id: "c1",
    alert_rule: { type: "price", op: "lte", value: 999999 }, // always met -> triggers an update call
  }));
  const { body, threw } = await run("overall time budget exhausted mid-processing", {
    allItems,
    allCards: oneCard,
    updateAdvanceMs: 20_000,
  });
  assert(!threw, "S3: GET must not throw when the time budget runs out");
  assert(body?.incomplete === true, "S3: incomplete:true is reported");
  assert(body?.phase === "processing", "S3: phase is 'processing'");
  assert(body?.triggered === 3, "S3: exactly 3 updates fit before the budget tripped");
  assert(body?.skippedForTime === 7, "S3: the remaining 7 items are reported as skippedForTime");
  assert(body.triggered + body.skippedForTime === N, "S3: every item is accounted for (none vanish)");
}

// Scenario 4 (re-review, 2026-09-12): the watchlist_items READ loop itself
// times out mid-pagination — 1500 rows means page 1 (1000 rows) then page
// 2 (500 rows) would normally follow. Each page costs enough virtual time
// that the budget is already gone before page 2's request would fire.
// Assert: exactly one watchlist_items page was fetched (never a second),
// zero cards/update calls happened, and the response honestly reports
// incompleteness instead of a partial totalItems as if it were the truth.
{
  const allItems = Array.from({ length: 1500 }, (_, i) => ({
    id: `w${i}`,
    card_id: "c1",
    alert_rule: { type: "price", op: "lte", value: 999999 },
  }));
  const { body, threw, calls } = await run("watchlist_items read times out mid-pagination", {
    allItems,
    allCards: oneCard,
    watchlistPageAdvanceMs: 50_000, // > TIME_BUDGET_MS after just the first page
  });
  assert(!threw, "S4: GET must not throw");
  assert(calls.watchlistPages === 1, "S4: only the first watchlist_items page is ever fetched, never a second");
  assert(calls.cardsChunks === 0, "S4: cards are never fetched once the watchlist_items read itself timed out");
  assert(calls.updates === 0, "S4: no update call happens either");
  assert(body?.incomplete === true, "S4: incomplete:true is reported");
  assert(body?.phase === "reading_watchlist_items", "S4: phase names the read that was still in progress");
  assert(body?.itemsReadSoFar === 1000, "S4: itemsReadSoFar reflects exactly the one page that did complete");
  assert(body?.totalItems === undefined, "S4: no totalItems field is present, so it can't be mistaken for the true total");
}

// Scenario 5 (re-review, 2026-09-12): the watchlist_items read completes
// fine (fast), but the cards .in() chunk read times out — 1500 unique
// card_ids means chunk 1 (1000 ids) then chunk 2 (500 ids) would normally
// follow. Assert: exactly one cards chunk was fetched, no update calls
// happened, and the response reports incompleteness for this phase too.
{
  const allItems = Array.from({ length: 1500 }, (_, i) => ({
    id: `w${i}`,
    card_id: `c${i}`, // 1500 distinct card_ids -> cards .in() needs 2 chunks
    alert_rule: { type: "price", op: "lte", value: 999999 },
  }));
  const allCards = Array.from({ length: 1500 }, (_, i) => ({
    id: `c${i}`,
    pct_vs_avg30: null,
    current_price: 600,
  }));
  const { body, threw, calls } = await run("cards read times out mid-chunking", {
    allItems,
    allCards,
    watchlistPageAdvanceMs: 100, // both watchlist_items pages complete comfortably within budget
    cardsChunkAdvanceMs: 50_000, // > TIME_BUDGET_MS after just the first cards chunk
  });
  assert(!threw, "S5: GET must not throw");
  assert(calls.watchlistPages === 2, "S5: both watchlist_items pages complete (this phase wasn't the slow one)");
  assert(calls.cardsChunks === 1, "S5: only the first cards chunk is ever fetched, never a second");
  assert(calls.updates === 0, "S5: no update call happens once the cards read timed out");
  assert(body?.incomplete === true, "S5: incomplete:true is reported");
  assert(body?.phase === "reading_cards", "S5: phase names the read that was still in progress");
  assert(body?.totalItems === 1500, "S5: totalItems is reported (the watchlist_items read DID complete)");
  assert(body?.cardsReadSoFar === 1000, "S5: cardsReadSoFar reflects exactly the one chunk that did complete");
  assert(body?.cardsNeeded === 1500, "S5: cardsNeeded shows how many were actually required");
}

// Control: everything valid and fast — proves the guards don't misfire when
// there's nothing wrong.
{
  const allItems = [
    { id: "w1", card_id: "c1", alert_rule: { type: "price", op: "lte", value: 999999 } },
    { id: "w2", card_id: "c1", alert_rule: { type: "price", op: "lte", value: 1 } },
  ];
  const { body, threw } = await run("control: all valid, fast", { allItems, allCards: oneCard });
  assert(!threw, "control: no throw");
  assert(body?.incomplete === false, "control: incomplete is explicitly false, not just absent");
  assert(body?.invalidRule === 0, "control: no false positives on valid rules");
  assert(body?.skippedForTime === 0, "control: no false positives on the time budget");
  assert(body?.triggered === 1 && body?.totalItems === 2, "control: exactly the one matching rule triggers");
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
