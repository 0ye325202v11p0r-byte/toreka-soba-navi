// Regression test for two bugs found by independent review (2026-09-12) in
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
//
// Like verify_cron_time_budget.mjs, this imports the REAL GET() handler
// (not a hand-copied reproduction) via the same Node module loader hook,
// with the Supabase client and Date.now() mocked. No real network or
// database calls.
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
function chain(resultPromiseFactory) {
  const self = {
    select: () => self,
    eq: () => self,
    order: () => self,
    range: () => self,
    in: () => self,
    abortSignal: () => resultPromiseFactory(),
  };
  return self;
}

function makeSupabaseMock({ items, cards, updateAdvanceMs = 0, updateShouldFail = () => false }) {
  return {
    from(table) {
      if (table === "watchlist_items") {
        return {
          select: () =>
            chain(async () => ({ data: items, error: null })), // single page: length < 1000
          update: (patch) => {
            const built = {
              _patch: patch,
              eq(_col, id) {
                this._id = id;
                return this;
              },
              abortSignal: () =>
                (async () => {
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
          select: () => chain(async () => ({ data: cards, error: null })),
        };
      }
      throw new Error(`verify_check_watchlist: unexpected table "${table}"`);
    },
  };
}

const { GET } = await import("../src/app/api/cron/check-watchlist/route.ts");

async function run(label, { items, cards, updateAdvanceMs = 0, updateShouldFail = () => false }) {
  virtualNow = 1_000_000_000;
  globalThis.__SUPABASE_MOCK__ = makeSupabaseMock({ items, cards, updateAdvanceMs, updateShouldFail });
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
    console.log(`status=${status} body=${JSON.stringify(body)}`);
  }
  return { body, status, threw };
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

// Scenario 1: one item has a malformed alert_rule (null), one is a valid
// rule that's currently met, one is a valid rule that isn't met. Before the
// fix, item order matters (a null rule anywhere in the list crashes the
// whole run) — this places the bad row in the MIDDLE so a fix that merely
// short-circuited on the first item wouldn't be caught by accident.
{
  const items = [
    { id: "w1", card_id: "c1", alert_rule: { type: "price", op: "lte", value: 999999 } }, // met
    { id: "w2", card_id: "c1", alert_rule: null }, // malformed — the bug trigger
    { id: "w3", card_id: "c1", alert_rule: { type: "price", op: "lte", value: 1 } }, // not met
  ];
  const cards = [{ id: "c1", pct_vs_avg30: null, current_price: 600 }];
  const { body, status, threw } = await run("malformed alert_rule (null) among valid items", { items, cards });
  assert(!threw, "S1: GET must not throw on a malformed alert_rule row");
  assert(status === 200, "S1: response status is 200, not a 500 from an uncaught exception");
  assert(body?.invalidRule === 1, "S1: the malformed row is counted as invalidRule, not silently dropped or crashing");
  assert(body?.triggered === 1, "S1: the valid, matching item (w1) still triggers");
  assert(body?.totalItems === 3, "S1: totalItems reflects all rows read, including the malformed one");
}

// Scenario 2: a malformed rule that's an object but with garbage field
// values (wrong type/op/value types) rather than JSON null.
{
  const items = [
    { id: "w1", card_id: "c1", alert_rule: { type: "not_a_real_type", op: "lte", value: 1 } },
    { id: "w2", card_id: "c1", alert_rule: { type: "price", op: "not_a_real_op", value: 1 } },
    { id: "w3", card_id: "c1", alert_rule: { type: "price", op: "lte", value: "not-a-number" } },
    { id: "w4", card_id: "c1", alert_rule: "just a string" },
  ];
  const cards = [{ id: "c1", pct_vs_avg30: null, current_price: 600 }];
  const { body, threw } = await run("various malformed alert_rule shapes", { items, cards });
  assert(!threw, "S2: GET must not throw on any malformed shape");
  assert(body?.invalidRule === 4, "S2: all four malformed rows are rejected by isValidAlertRule");
  assert(body?.triggered === 0, "S2: nothing triggers from malformed rows");
}

// Scenario 3: overall time budget — many triggering items, each update call
// costs enough virtual time that the cumulative total exceeds
// TIME_BUDGET_MS partway through. The loop must stop and report
// skippedForTime, rather than running unboundedly past the budget.
{
  const N = 10;
  const items = Array.from({ length: N }, (_, i) => ({
    id: `w${i}`,
    card_id: "c1",
    alert_rule: { type: "price", op: "lte", value: 999999 }, // always met -> triggers an update call
  }));
  const cards = [{ id: "c1", pct_vs_avg30: null, current_price: 600 }];
  // TIME_BUDGET_MS is 45_000 in route.ts; each update costs 20_000ms of
  // virtual time, so after 2 updates the budget is already exceeded and the
  // 3rd+ items must be skipped rather than each independently attempted.
  const { body, threw } = await run("overall time budget exhausted mid-run", {
    items,
    cards,
    updateAdvanceMs: 20_000,
  });
  assert(!threw, "S3: GET must not throw when the time budget runs out");
  assert(body?.skippedForTime > 0, "S3: remaining items are reported as skippedForTime, not silently dropped");
  assert(
    body.triggered + body.skippedForTime === N,
    "S3: every item is accounted for as either triggered or skippedForTime (none vanish)"
  );
  assert(body.triggered < N, "S3: the budget guard actually stopped the loop before processing all items");
}

// Control: everything valid and fast — proves the guards don't misfire when
// there's nothing wrong.
{
  const items = [
    { id: "w1", card_id: "c1", alert_rule: { type: "price", op: "lte", value: 999999 } },
    { id: "w2", card_id: "c1", alert_rule: { type: "price", op: "lte", value: 1 } },
  ];
  const cards = [{ id: "c1", pct_vs_avg30: null, current_price: 600 }];
  const { body, threw } = await run("control: all valid, fast", { items, cards });
  assert(!threw, "control: no throw");
  assert(body?.invalidRule === 0, "control: no false positives on valid rules");
  assert(body?.skippedForTime === 0, "control: no false positives on the time budget");
  assert(body?.triggered === 1 && body?.totalItems === 2, "control: exactly the one matching rule triggers");
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
