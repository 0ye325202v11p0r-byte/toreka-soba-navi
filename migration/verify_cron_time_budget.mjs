// Regression test for the DB-call time-budget bug found by independent
// review (2026-09-11, fixed in commit 462d471): remainingMs must be
// recomputed fresh before each DB call within a loop iteration, and a call
// must be skipped (the card treated as failed) once the budget is
// exhausted — not always attempted with a forced ~1s-minimum timeout.
//
// This imports the REAL GET() handler from
// src/app/api/cron/refresh-prices/route.ts (not a hand-copied
// reproduction) via a Node module loader hook (_test_mocks/loader.mjs)
// that redirects "@supabase/supabase-js" to a controllable mock and
// resolves the "@/..." path alias without a bundler. Date.now() and
// global.fetch are also mocked, so every scenario runs on a fully virtual
// clock — no real network or database calls.
//
// Run: node --experimental-strip-types migration/verify_cron_time_budget.mjs
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

// ---- fetch mock (external price page) ----
let fetchAdvanceMs = 0;
global.fetch = async () => {
  advance(fetchAdvanceMs);
  return { ok: true, text: async () => "本日の販売平均額は1,000円です" };
};

// ---- Supabase mock ----
// advanceMs per DB call; call flags to assert what actually ran.
const state = {
  upsertAdvanceMs: 0,
  historyAdvanceMs: 0,
  cardUpdateAdvanceMs: 0,
  upsertCalled: false,
  historySelectCalled: false,
  cardUpdateCalled: false,
};

function resetState() {
  state.upsertAdvanceMs = 0;
  state.historyAdvanceMs = 0;
  state.cardUpdateAdvanceMs = 0;
  state.upsertCalled = false;
  state.historySelectCalled = false;
  state.cardUpdateCalled = false;
}

// A thenable chain: every method but abortSignal() returns itself;
// abortSignal() returns the promise supplied at construction time.
function chain(resultPromiseFactory) {
  const self = {
    select: () => self,
    eq: () => self,
    not: () => self,
    order: () => self,
    limit: () => self,
    abortSignal: () => resultPromiseFactory(),
  };
  return self;
}

function makeSupabaseMock() {
  return {
    from(table) {
      if (table === "cards") {
        return {
          select: () =>
            chain(async () => ({
              data: [
                {
                  id: "c-test-1",
                  name: "テストカード",
                  source_url: "https://example.invalid/c-test-1",
                  history_is_estimated: false,
                },
              ],
              error: null,
            })),
          update: () => {
            state.cardUpdateCalled = true;
            return chain(async () => {
              advance(state.cardUpdateAdvanceMs);
              return { error: null };
            });
          },
        };
      }
      if (table === "price_snapshots") {
        return {
          upsert: () => {
            state.upsertCalled = true;
            return chain(async () => {
              advance(state.upsertAdvanceMs);
              return { error: null };
            });
          },
          select: () => {
            state.historySelectCalled = true;
            return chain(async () => {
              advance(state.historyAdvanceMs);
              return {
                data: [{ snapshot_date: "2026-09-11", price: 1000 }],
                error: null,
              };
            });
          },
        };
      }
      if (table === "sync_runs") {
        return { insert: () => chain(async () => ({ error: null })) };
      }
      throw new Error(`verify_cron_time_budget: unexpected table "${table}"`);
    },
  };
}

const { GET } = await import("../src/app/api/cron/refresh-prices/route.ts");

async function runScenario(label, { fetchMs = 0, upsertMs = 0, historyMs = 0, updateMs = 0 }) {
  resetState();
  virtualNow = 1_000_000_000;
  fetchAdvanceMs = fetchMs;
  state.upsertAdvanceMs = upsertMs;
  state.historyAdvanceMs = historyMs;
  state.cardUpdateAdvanceMs = updateMs;
  globalThis.__SUPABASE_MOCK__ = makeSupabaseMock();

  const request = new Request("http://localhost/api/cron/refresh-prices", {
    headers: { Authorization: "Bearer test-secret" },
  });
  const res = await GET(request);
  const body = await res.json();
  console.log(`\n--- ${label} ---`);
  console.log(JSON.stringify(body));
  console.log(
    `upsertCalled=${state.upsertCalled} historySelectCalled=${state.historySelectCalled} cardUpdateCalled=${state.cardUpdateCalled}`
  );
  return { body, ...state };
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

// TIME_BUDGET_MS is 270_000 in route.ts. Each scenario pushes the virtual
// clock past that budget at a specific point in the per-card sequence, and
// asserts the code stops there instead of attempting the next DB call.

// Scenario 1: fetch alone exhausts the budget -> upsert must never be called.
{
  const r = await runScenario("expires after fetch (before upsert)", { fetchMs: 300_000 });
  assert(r.upsertCalled === false, "S1: upsert must not be called once budget is gone after fetch");
  assert(r.historySelectCalled === false, "S1: history select must not be called");
  assert(r.cardUpdateCalled === false, "S1: cards update must not be called");
  assert(r.body.failed === 1 && r.body.success === 0, "S1: the card is reported as failed, not succeeded");
}

// Scenario 2: fetch fits, upsert exhausts the budget -> history select must
// never be called.
{
  const r = await runScenario("expires after upsert (before history select)", {
    fetchMs: 1000,
    upsertMs: 300_000,
  });
  assert(r.upsertCalled === true, "S2: upsert should have been attempted");
  assert(r.historySelectCalled === false, "S2: history select must not be called once budget is gone after upsert");
  assert(r.cardUpdateCalled === false, "S2: cards update must not be called");
  assert(r.body.failed === 1 && r.body.success === 0, "S2: the card is reported as failed, not succeeded");
}

// Scenario 3: fetch + upsert fit, history select exhausts the budget ->
// cards update must never be called.
{
  const r = await runScenario("expires after history select (before card update)", {
    fetchMs: 1000,
    upsertMs: 1000,
    historyMs: 300_000,
  });
  assert(r.upsertCalled === true, "S3: upsert should have been attempted");
  assert(r.historySelectCalled === true, "S3: history select should have been attempted");
  assert(r.cardUpdateCalled === false, "S3: cards update must not be called once budget is gone after history read");
  assert(r.body.failed === 1 && r.body.success === 0, "S3: the card is reported as failed, not succeeded");
}

// Control scenario: everything fast -> the card succeeds normally, proving
// the guards don't misfire when there's plenty of budget left.
{
  const r = await runScenario("control: plenty of budget, everything fast", {
    fetchMs: 100,
    upsertMs: 100,
    historyMs: 100,
    updateMs: 100,
  });
  assert(r.upsertCalled && r.historySelectCalled && r.cardUpdateCalled, "control: all three DB calls should run");
  assert(r.body.success === 1 && r.body.failed === 0, "control: the card succeeds when budget is ample");
  assert(r.body.syncRunLogged === true, "control: sync_runs log write succeeds");
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
