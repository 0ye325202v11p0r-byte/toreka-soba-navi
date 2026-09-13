// Regression test for src/lib/cardSharding.ts's cardShardIndex() — the
// free-tier alternative to Vercel Pro for updating the whole catalog daily
// (added 2026-09-13, see refresh-prices/route.ts and vercel.json).
//
// Run: node --experimental-strip-types migration/verify_card_sharding.mjs
import { register } from "node:module";
register("./_test_mocks/loader.mjs", import.meta.url);

const { cardShardIndex } = await import("../src/lib/cardSharding.ts");

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
  assert(actual === expected, `${label} — expected ${expected}, got ${actual}`);
}

// T1: deterministic — the same id with the same shardCount always maps to
// the same shard (this is the whole point: a card must never flip-flop
// between shards from one day to the next, or it could be skipped by both
// or processed by neither).
{
  const a = cardShardIndex("op01-001", 6);
  const b = cardShardIndex("op01-001", 6);
  assertEqual(a, b, "T1: the same card id always hashes to the same shard");
}

// T2: every result is a valid shard index in [0, shardCount).
{
  const ids = ["op01-001", "st10-013", "eb04-020", "c1", "c2", "史上最高値カード"];
  for (const id of ids) {
    for (const shardCount of [1, 3, 6, 10]) {
      const idx = cardShardIndex(id, shardCount);
      assert(idx >= 0 && idx < shardCount, `T2: cardShardIndex(${id}, ${shardCount}) = ${idx} is in range`);
    }
  }
}

// T3: shardCount=1 always returns shard 0 (degenerate case — equivalent to
// "no sharding", matching refresh-prices/route.ts's behavior when the
// shard/shards query params are omitted entirely).
{
  assertEqual(cardShardIndex("anything", 1), 0, "T3: a single shard always returns index 0");
}

// T4: distribution sanity check — across a few hundred distinct realistic
// ids, no single shard (of 6) should end up empty or wildly overloaded.
// This isn't a strict statistical test, just a guard against an
// accidentally degenerate hash (e.g. one that always returns 0).
{
  const shardCount = 6;
  const counts = new Array(shardCount).fill(0);
  for (let i = 0; i < 844; i++) {
    const id = `card-${i.toString().padStart(4, "0")}`;
    counts[cardShardIndex(id, shardCount)]++;
  }
  const min = Math.min(...counts);
  const max = Math.max(...counts);
  assert(min > 0, `T4: every shard received at least one card (counts=${JSON.stringify(counts)})`);
  // 844/6 ≈ 141 per shard on average — a healthy hash should keep every
  // shard within a generous ±50% band of that, not concentrate everything
  // into one or two shards.
  assert(max < 141 * 1.5 && min > 141 * 0.5, `T4: shard sizes are reasonably balanced (counts=${JSON.stringify(counts)})`);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exitCode = 1;
