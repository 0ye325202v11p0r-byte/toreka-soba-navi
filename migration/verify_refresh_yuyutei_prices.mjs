// Regression test for src/app/api/cron/refresh-yuyutei-prices/route.ts
// (added 2026-09-12, following the user's explicit legal-risk acceptance
// for the yuyu-tei source). Imports the REAL GET() handler (not a
// hand-copied reproduction) via the same Node module loader hook used by
// verify_cron_time_budget.mjs / verify_check_watchlist.mjs, with
// Date.now(), global.fetch, and the Supabase client all mocked. No real
// network or database calls.
//
// This route has three phases, each with its own time-budget exposure —
// the exact bug class this project keeps finding (refresh-prices' 3
// sequential per-card DB calls sharing one stale timeout; check-watchlist's
// read loops missing a budget check entirely):
//   1. Fetching ~57 yuyu-tei set-list pages (external HTTP, one per set)
//   2. Reading existing 'partial' cards, paginated (DB read)
//   3. Per-card: upsert snapshot -> read history -> update card (DB writes)
// Scenarios below independently exhaust the budget at each phase boundary
// and assert no further I/O of any kind happens afterward.
//
// setTimeout is globally replaced with an immediate callback (ignoring the
// requested delay) so the route's real `sleep(1500)` between set fetches
// doesn't make this test take 57*1.5s ≈ 85s of actual wall-clock time —
// only Date.now() (the virtual clock) drives the budget checks; the sleep
// itself is just paced-ness, not correctness, and isn't what this test is
// verifying.
//
// Run: node --experimental-strip-types migration/verify_refresh_yuyutei_prices.mjs
import { register } from "node:module";
import { readFileSync } from "fs";

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

// ---- instant "sleep" (real wall-clock time is not what's under test) ----
globalThis.setTimeout = (fn) => {
  fn();
  return 0;
};

// ---- fetch mock (yuyu-tei set-list pages) ----
// Reuses the real fixture (a genuine ~2.8KB excerpt of a live yuyu-tei set
// page) so the REAL parseSetPage() has real markup to parse — every
// mocked fetch returns the same two known card listings/URLs regardless of
// which set slug was requested, which is enough to exercise this route's
// own control flow (the parser itself is separately regression-tested in
// verify_yuyutei_parser.mjs).
const fixtureHtml = readFileSync(new URL("./_test_fixtures/yuyutei_op01_sample.html", import.meta.url), "utf8");
const FIXTURE_URL_1 = "https://yuyu-tei.jp/sell/opc/card/op01/10151"; // price 3,980
const FIXTURE_URL_2 = "https://yuyu-tei.jp/sell/opc/card/op01/10152"; // price 148,000

let fetchAdvanceMs = 0;
let fetchCallCount = 0;
let fetchShouldFail = () => false;
global.fetch = async (url) => {
  fetchCallCount++;
  advance(fetchAdvanceMs);
  if (fetchShouldFail(String(url))) return { ok: false, status: 500 };
  return { ok: true, text: async () => fixtureHtml };
};

// ---- Supabase mock ----
function chain(resultPromiseFactory) {
  const self = {
    select: () => self,
    eq: () => self,
    not: () => self,
    order: () => self,
    limit: () => self,
    range: () => self,
    abortSignal: () => resultPromiseFactory(),
  };
  return self;
}

function makeSupabaseMock({
  allCards = [],
  cardsPageAdvanceMs = 0,
  upsertAdvanceMs = 0,
  historyAdvanceMs = 0,
  updateAdvanceMs = 0,
  updateShouldFail = () => false,
  syncRunShouldFail = false,
  // Either a boolean (shorthand for the common "explicit true/false stored
  // value" case) or a function returning/throwing the raw
  // {data, error}-shaped result, for scenarios that need to simulate a
  // query error, a thrown exception, or an unrecognized stored value.
  appSettingsResult = true,
}) {
  const calls = { cardsPages: 0, upserts: 0, historySelects: 0, updates: 0, syncRunInsert: 0, appSettingsReads: 0 };
  const mock = {
    from(table) {
      if (table === "app_settings") {
        return {
          select: () => ({
            eq: () => ({
              abortSignal: () => ({
                maybeSingle: async () => {
                  calls.appSettingsReads++;
                  if (typeof appSettingsResult === "function") return appSettingsResult();
                  return { data: { value: appSettingsResult }, error: null };
                },
              }),
            }),
          }),
        };
      }
      if (table === "cards") {
        return {
          select: () => {
            let from = 0;
            let to = allCards.length - 1;
            const builder = {
              eq: () => builder,
              not: () => builder,
              order: () => builder,
              range: (f, t) => {
                from = f;
                to = t;
                return builder;
              },
              limit: () => builder,
              abortSignal: () =>
                (async () => {
                  calls.cardsPages++;
                  advance(cardsPageAdvanceMs);
                  return { data: allCards.slice(from, to + 1), error: null };
                })(),
            };
            return builder;
          },
          update: () => {
            calls.updates++;
            const built = {
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
      if (table === "price_snapshots") {
        return {
          upsert: () => {
            calls.upserts++;
            return chain(async () => {
              advance(upsertAdvanceMs);
              return { error: null };
            });
          },
          select: () => {
            calls.historySelects++;
            return chain(async () => {
              advance(historyAdvanceMs);
              return { data: [{ snapshot_date: "2026-09-12", price: 1000 }], error: null };
            });
          },
        };
      }
      if (table === "yuyutei_sync_runs") {
        return {
          insert: () => {
            calls.syncRunInsert++;
            return chain(async () => (syncRunShouldFail ? { error: { message: "relation does not exist" } } : { error: null }));
          },
        };
      }
      throw new Error(`verify_refresh_yuyutei_prices: unexpected table "${table}"`);
    },
  };
  return { mock, calls };
}

const { GET } = await import("../src/app/api/cron/refresh-yuyutei-prices/route.ts");

async function run(label, opts) {
  virtualNow = 1_000_000_000;
  fetchCallCount = 0;
  fetchAdvanceMs = opts.fetchAdvanceMs ?? 0;
  fetchShouldFail = opts.fetchShouldFail ?? (() => false);
  const { mock, calls } = makeSupabaseMock(opts);
  globalThis.__SUPABASE_MOCK__ = mock;
  const request = new Request("http://localhost/api/cron/refresh-yuyutei-prices", {
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
    console.log(`status=${status} body=${JSON.stringify(body)} calls=${JSON.stringify(calls)} fetchCallCount=${fetchCallCount}`);
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

const twoMatchingCards = [
  { id: "c1", name: "テストカード1", source_url: FIXTURE_URL_1, history_is_estimated: true },
  { id: "c2", name: "テストカード2", source_url: FIXTURE_URL_2, history_is_estimated: true },
];

// Control: everything fast, both cards' source_url are found in the
// (mocked) fetch results -> both succeed, all 57 sets fetched, sync run
// logged.
{
  const { body, threw, calls } = await run("control: plenty of budget, everything fast", {
    allCards: twoMatchingCards,
  });
  assert(!threw, "control: no throw");
  assert(body?.setsFetched === 57, "control: all 57 sets fetched");
  assert(body?.setsFailed === 0, "control: no set-fetch failures");
  assert(body?.total === 2 && body?.success === 2 && body?.failed === 0, "control: both cards succeed");
  assert(body?.notFoundInFetch === 0, "control: both cards' URLs were found in the fetch results");
  assert(calls.updates === 2, "control: cards.update() called exactly once per successful card");
  assert(body?.syncRunLogged === true, "control: yuyutei_sync_runs insert succeeds");
}

// Scenario 0 (emergency kill-switch, see src/lib/appSettings.ts): when
// yuyutei_source_enabled is explicitly false, the route must return
// immediately after that one check — zero requests to yuyu-tei.jp, zero
// cards reads, zero DB writes of any kind. This is the "stop sending them
// traffic" half of complying with a takedown request; it must not depend
// on the time budget or any other later logic to take effect.
{
  const { body, threw, calls } = await run("kill-switch: yuyutei_source_enabled is false", {
    allCards: twoMatchingCards,
    appSettingsResult: false,
  });
  assert(!threw, "S0: no throw");
  assert(body?.disabled === true, "S0: response reports disabled:true");
  assert(body?.settingsState === "disabled", "S0: settingsState is reported as 'disabled'");
  assert(fetchCallCount === 0, "S0: zero requests to yuyu-tei.jp — not even one set page");
  assert(calls.cardsPages === 0, "S0: cards are never read");
  assert(calls.upserts === 0 && calls.updates === 0, "S0: no price_snapshots/cards writes");
  assert(calls.syncRunInsert === 0, "S0: not even the sync-run log is written (nothing ran to log)");
  assert(calls.appSettingsReads === 1, "S0: exactly one app_settings check happened, before anything else");
}

// Scenarios 0b-0e (Codex independent review, 2026-09-12): the settings
// read can fail in ways that are NOT "explicitly false" — a generic query
// error, a thrown exception, a timeout, or an unrecognized stored value.
// None of these confirm the switch is actually enabled, so this route
// must fail CLOSED on all of them (zero fetches) exactly like the
// explicit-false case — this is the property the original implementation
// got wrong (it fell back to "enabled" on any of these).
{
  const { body, threw, calls } = await run("kill-switch: settings read hits a generic query error (not missing-table)", {
    allCards: twoMatchingCards,
    appSettingsResult: () => ({ data: null, error: { code: "500", message: "internal server error" } }),
  });
  assert(!threw, "S0b: no throw");
  assert(body?.disabled === true, "S0b: response reports disabled:true");
  assert(body?.settingsState === "unknown", "S0b: settingsState is 'unknown', distinct from 'disabled'");
  assert(fetchCallCount === 0, "S0b: zero requests to yuyu-tei.jp");
  assert(calls.cardsPages === 0 && calls.updates === 0, "S0b: no cards read or written");
}
{
  const { body, threw, calls } = await run("kill-switch: settings read throws synchronously", {
    allCards: twoMatchingCards,
    appSettingsResult: () => {
      throw new Error("network error");
    },
  });
  assert(!threw, "S0c: no throw escapes to the caller");
  assert(body?.disabled === true, "S0c: response reports disabled:true");
  assert(body?.settingsState === "unknown", "S0c: settingsState is 'unknown'");
  assert(fetchCallCount === 0, "S0c: zero requests to yuyu-tei.jp");
}
{
  const { body, threw, calls } = await run("kill-switch: settings read times out (AbortSignal fires)", {
    allCards: twoMatchingCards,
    appSettingsResult: () => {
      throw new Error("The operation was aborted due to timeout");
    },
  });
  assert(!threw, "S0d: no throw escapes to the caller");
  assert(body?.disabled === true, "S0d: response reports disabled:true — a slow/timed-out read must NOT resume scraping");
  assert(body?.settingsState === "unknown", "S0d: settingsState is 'unknown'");
  assert(fetchCallCount === 0, "S0d: zero requests to yuyu-tei.jp");
}
{
  const { body, threw, calls } = await run("kill-switch: stored value is not a recognized boolean", {
    allCards: twoMatchingCards,
    appSettingsResult: "not-a-boolean",
  });
  assert(!threw, "S0e: no throw");
  assert(body?.disabled === true, "S0e: response reports disabled:true");
  assert(body?.settingsState === "unknown", "S0e: settingsState is 'unknown'");
  assert(fetchCallCount === 0, "S0e: zero requests to yuyu-tei.jp");
}

// Scenario 0f: the table/row genuinely doesn't exist yet (the actual
// current production state, before migration/README.md's manual setup
// step is done) — this is NOT the same as "unknown" and must NOT disable
// scraping; it's indistinguishable from "nobody has set this up", so
// today's no-kill-switch-at-all behavior is preserved until the table
// exists.
{
  const { body, threw, calls } = await run("no kill-switch yet: app_settings table doesn't exist (PostgREST schema-cache-miss)", {
    allCards: twoMatchingCards,
    appSettingsResult: () => ({
      data: null,
      error: { code: "PGRST205", message: "Could not find the table 'public.app_settings' in the schema cache" },
    }),
  });
  assert(!threw, "S0f: no throw");
  assert(body?.disabled === undefined, "S0f: response does NOT report disabled — scraping proceeds normally");
  assert(fetchCallCount === 57, "S0f: all 57 sets are still fetched, exactly as if there were no kill-switch at all");
  assert(calls.updates === 2, "S0f: cards are still processed normally");
}

// Scenario 1: the set-fetch phase itself runs out of budget partway
// through (each fetch costs enough virtual time that TIME_BUDGET_MS trips
// before all 57 are done). Assert setsSkippedForTime > 0 and fewer than 57
// sets were actually fetched — the loop must stop fetching, not push on
// regardless.
{
  const { body, threw, calls } = await run("set-fetch phase exhausts the time budget", {
    allCards: twoMatchingCards,
    fetchAdvanceMs: 10_000, // 27 fetches * 10s = 270s = TIME_BUDGET_MS
  });
  assert(!threw, "S1: no throw");
  assert(body.setsFetched < 57, "S1: not all 57 sets were fetched");
  assert(body.setsSkippedForTime > 0, "S1: remaining sets are reported as skipped for time");
  assert(body.setsFetched + body.setsFailed + body.setsSkippedForTime === 57, "S1: every set is accounted for");
  // No budget left at all afterward -> the cards read loop's very first
  // budget check should also refuse to proceed, so no card DB calls happen.
  assert(calls.cardsPages === 0, "S1: with zero budget left, the cards read loop never even starts");
}

// Scenario 2: set-fetch phase is fast and complete, but a couple of set
// fetches individually fail (e.g. transient network error) -> counted as
// setsFailed, not fatal to the run, and doesn't affect unrelated sets'
// success.
{
  let failCount = 0;
  const { body, threw } = await run("some individual set fetches fail", {
    allCards: twoMatchingCards,
    fetchShouldFail: () => {
      failCount++;
      return failCount <= 3; // first 3 fetches fail, rest succeed
    },
  });
  assert(!threw, "S2: no throw");
  assert(body.setsFailed === 3, "S2: exactly the 3 failing fetches are counted");
  assert(body.setsFetched === 54, "S2: the remaining 54 sets still succeed");
  // Both cards' URLs are still findable (the fixture's card URLs came from
  // one of the successfully-fetched sets in this scenario's ordering).
  assert(body.total === 2, "S2: card processing still proceeds normally");
}

// Scenario 3: the per-card write phase (upsert/history/update) runs out
// of budget partway through processing — mirrors refresh-prices' own
// regression test for the identical bug class. Card 1's upsert alone
// consumes the whole remaining budget; the code's own pre-flight check
// before the history read must then refuse to proceed for card 1 (counted
// as failed, not success), and the outer loop's own check must refuse to
// even start card 2 (counted as skippedForTime, not attempted at all).
{
  const { body, threw, calls } = await run("card write phase exhausts the time budget", {
    allCards: twoMatchingCards,
    upsertAdvanceMs: 300_000, // one upsert alone blows the whole remaining budget
  });
  assert(!threw, "S3: no throw");
  assert(calls.upserts === 1, "S3: only the first card's upsert is attempted");
  assert(calls.historySelects === 0, "S3: history read never happens once the budget is gone after the upsert");
  assert(calls.updates === 0, "S3: cards.update() never happens either");
  assert(body.failed === 1 && body.success === 0, "S3: card 1 is counted as failed, not success");
  assert(body.skippedForTime === 1, "S3: card 2 is never even attempted, counted as skippedForTime");
}

// Scenario 4: a card's source_url isn't present in this run's fetched
// prices (e.g. its set wasn't reached this run, or it's been delisted).
// Must be counted separately from a genuine failure, and must not attempt
// any DB write for that card.
{
  const cardsWithOneMissing = [
    ...twoMatchingCards,
    { id: "c3", name: "テストカード3", source_url: "https://yuyu-tei.jp/sell/opc/card/op99/99999", history_is_estimated: true },
  ];
  const { body, threw, calls } = await run("a card's price wasn't found in this run's fetch results", {
    allCards: cardsWithOneMissing,
  });
  assert(!threw, "S4: no throw");
  assert(body.notFoundInFetch === 1, "S4: the unmatched card is counted separately from failures");
  assert(body.total === 3 && body.success === 2 && body.failed === 0, "S4: the other two cards still succeed normally");
  assert(calls.updates === 2, "S4: no update call was ever attempted for the not-found card");
}

// Scenario 5: the final yuyutei_sync_runs insert fails (simulating the
// table not existing yet in production, since it must be created manually
// — see supabase/schema.sql). The route must still report the real work
// that happened (not fail the whole response) and surface the log error.
{
  const { body, threw } = await run("yuyutei_sync_runs insert fails (table not created yet)", {
    allCards: twoMatchingCards,
    syncRunShouldFail: true,
  });
  assert(!threw, "S5: no throw");
  assert(body?.success === 2, "S5: the actual price-tracking work still completed");
  assert(body?.syncRunLogged === false, "S5: syncRunLogged is false");
  assert(typeof body?.syncRunLogError === "string" && body.syncRunLogError.length > 0, "S5: syncRunLogError is surfaced");
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
