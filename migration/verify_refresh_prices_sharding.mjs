// Regression test for the shard/shards query params added to
// src/app/api/cron/refresh-prices/route.ts (2026-09-13) — the free-tier
// alternative to Vercel Pro for refreshing the whole catalog daily instead
// of over several days (see cardSharding.ts and vercel.json). Imports the
// REAL GET() handler via the shared loader hook, with Supabase and
// global.fetch both mocked. No real network or database calls.
//
// Run: node --experimental-strip-types migration/verify_refresh_prices_sharding.mjs
import { register } from "node:module";
register("./_test_mocks/loader.mjs", import.meta.url);

process.env.CRON_SECRET = "test-secret";
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.invalid";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";

const { cardShardIndex } = await import("../src/lib/cardSharding.ts");

global.fetch = async () => ({ ok: true, text: async () => "本日の販売平均額は1,000円です" });

function chain(resultPromiseFactory) {
  const self = {
    select: () => self,
    eq: () => self,
    not: () => self,
    in: () => self,
    order: () => self,
    limit: () => self,
    abortSignal: () => resultPromiseFactory(),
  };
  return self;
}

function makeSupabaseMock(allCards) {
  const updatedIds = [];
  const mock = {
    from(table) {
      if (table === "cards") {
        return {
          select: () => chain(async () => ({ data: allCards, error: null })),
          update: () => ({
            eq: (_col, id) => {
              updatedIds.push(id);
              return chain(async () => ({ error: null }));
            },
          }),
        };
      }
      if (table === "price_snapshots") {
        return {
          upsert: () => chain(async () => ({ error: null })),
          select: () =>
            chain(async () => ({
              data: [{ snapshot_date: "2026-09-13", price: 1000 }],
              error: null,
            })),
        };
      }
      if (table === "sync_runs") {
        return { insert: () => chain(async () => ({ error: null })) };
      }
      throw new Error(`verify_refresh_prices_sharding: unexpected table "${table}"`);
    },
  };
  return { mock, updatedIds };
}

function card(id) {
  return { id, name: `カード${id}`, source_url: `https://example.invalid/${id}`, history_is_estimated: false };
}

const { GET } = await import("../src/app/api/cron/refresh-prices/route.ts");

async function run(pathAndQuery, allCards) {
  const { mock, updatedIds } = makeSupabaseMock(allCards);
  globalThis.__SUPABASE_MOCK__ = mock;
  const request = new Request(`http://localhost${pathAndQuery}`, {
    headers: { Authorization: "Bearer test-secret" },
  });
  const res = await GET(request);
  const body = await res.json();
  return { body, updatedIds };
}

let pass = 0;
let fail = 0;
function assert(cond, label) {
  if (cond) pass++;
  else {
    fail++;
    console.error(`FAIL: ${label}`);
  }
}
function assertEqual(actual, expected, label) {
  assert(
    JSON.stringify(actual) === JSON.stringify(expected),
    `${label} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
  );
}

const ids = ["op01-001", "op01-002", "st10-013", "eb04-020", "c-alpha", "c-beta", "c-gamma", "c-delta"];
const allCards = ids.map(card);
const shardCount = 6;
const expectedByShard = new Map();
for (const id of ids) {
  const idx = cardShardIndex(id, shardCount);
  const list = expectedByShard.get(idx) ?? [];
  list.push(id);
  expectedByShard.set(idx, list);
}

// T1: for each shard, only the cards that actually hash into it get
// processed — never a card from a different shard, and never zero when the
// shard genuinely has cards assigned.
for (const [shardIdx, expectedIds] of expectedByShard.entries()) {
  const { body, updatedIds } = await run(
    `/api/cron/refresh-prices?shard=${shardIdx}&shards=${shardCount}`,
    allCards
  );
  assertEqual(
    [...updatedIds].sort(),
    [...expectedIds].sort(),
    `T1 (shard ${shardIdx}): only this shard's own cards are updated`
  );
  assertEqual(body.total, expectedIds.length, `T1 (shard ${shardIdx}): body.total matches this shard's card count`);
  assertEqual(body.shard, shardIdx, "T1: body.shard echoes the requested shard index");
  assertEqual(body.shardCount, shardCount, "T1: body.shardCount echoes the requested shard count");
  assertEqual(body.catalogTotal, ids.length, "T1: body.catalogTotal reflects the FULL catalog, not just this shard");
}

// T2: omitting shard/shards entirely processes every matching card, exactly
// as before this feature existed — and the response carries no shard/
// shardCount fields at all (not even null), so a caller relying on their
// absence to detect "unsharded mode" keeps working.
{
  const { body, updatedIds } = await run("/api/cron/refresh-prices", allCards);
  assertEqual([...updatedIds].sort(), [...ids].sort(), "T2: every card is processed when shard/shards is omitted");
  assertEqual(body.total, ids.length, "T2: body.total covers the whole catalog");
  assert(!("shard" in body) && !("shardCount" in body), "T2: no shard/shardCount fields appear in the unsharded response");
}

// T3: providing only `shard` without `shards` (or vice versa) is treated as
// "no sharding" — a malformed/partial query string must never silently
// process zero cards or crash.
{
  const { body, updatedIds } = await run("/api/cron/refresh-prices?shard=2", allCards);
  assertEqual([...updatedIds].sort(), [...ids].sort(), "T3: `shard` alone (no `shards`) processes every card, same as omitting both");
  assertEqual(body.total, ids.length, "T3: body.total covers the whole catalog when sharding params are incomplete");
}

// T4: the same card id always lands in the same shard across repeated
// calls — sharding must be deterministic, not e.g. based on array position
// or call order (already covered at the unit level by
// verify_card_sharding.mjs, re-checked here through the real route).
{
  const { updatedIds: run1 } = await run(`/api/cron/refresh-prices?shard=0&shards=${shardCount}`, allCards);
  const { updatedIds: run2 } = await run(`/api/cron/refresh-prices?shard=0&shards=${shardCount}`, allCards);
  assertEqual([...run1].sort(), [...run2].sort(), "T4: the same shard request yields the same set of cards every time");
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exitCode = 1;
