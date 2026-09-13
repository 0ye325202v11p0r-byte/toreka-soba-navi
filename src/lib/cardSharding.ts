/**
 * "無料枠のまま更新頻度を上げる" (added 2026-09-13) — Vercel Hobby caps a
 * single cron job at once-per-day, and refresh-prices' own per-card fetch
 * takes long enough that one daily run can only get through a few hundred
 * of the 844 'real' cards before its time budget runs out (see
 * refresh-prices/route.ts's header comment) — meaning a card can go
 * several days between updates. Hobby does NOT limit the NUMBER of cron
 * jobs (100/project, confirmed via Vercel's docs), only how often any ONE
 * of them fires. So instead of paying for Vercel Pro just to run the same
 * job more often, refresh-prices is split across several independent daily
 * cron entries (see vercel.json), each handling one fixed shard of the
 * catalog at a different hour — the same total number of external
 * requests per day (no change to the "polite rate limit" commitment to
 * onepiece-card-atari.jp), just spread across more invocations so every
 * card actually gets touched once per day instead of once every few days.
 *
 * cardShardIndex() is a pure, stable hash: the SAME card.id always maps to
 * the SAME shard (as long as shardCount itself doesn't change), so a card
 * is never skipped or double-processed by adjacent runs, and the mapping
 * doesn't depend on catalog size or ordering.
 */
export function cardShardIndex(cardId: string, shardCount: number): number {
  let hash = 0;
  for (let i = 0; i < cardId.length; i++) {
    // djb2-style rolling hash — >>> 0 keeps every intermediate value a
    // non-negative 32-bit integer so `% shardCount` below can never go
    // negative (a plain `hash * 31 + charCode` left unsigned would
    // eventually overflow into a negative JS number for long ids).
    hash = (hash * 31 + cardId.charCodeAt(i)) >>> 0;
  }
  return hash % shardCount;
}
