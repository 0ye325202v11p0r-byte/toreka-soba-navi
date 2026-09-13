import { computePriceRecord, type PriceRecordResult } from "./priceRecord";

// Injectable I/O boundary (mirrors this project's other lib/*Server.ts split
// between pure logic and I/O) so resolvePriceRecord() can be unit-tested
// with a fake fetcher instead of a full mocked Supabase client.
export interface AllPricesFetcher {
  fetchAllPrices(cardId: string): Promise<number[]>;
}

/**
 * Resolves this card's record status for `currentPrice`, lazily seeding
 * all_time_high_price/all_time_low_price from FULL price_snapshots history
 * the first time either is null (a card added before this feature existed,
 * or genuinely brand new) — every later call for the same card has both
 * priors already set and takes the fast path with zero extra I/O. This is
 * a deliberate one-time-per-card cost paid by the daily refresh-prices cron
 * itself rather than a separate backfill script run once against
 * production — see migration/retrofit_add_price_records.sql's comment for
 * why.
 *
 * Seeding from full history (not just the last-90-day window computeStats()
 * uses) means currentPrice is necessarily already included in that scan, so
 * it can at best TIE the freshly-seeded max/min on a card's first sighting —
 * never falsely reported as a "new" record on backfill day.
 */
export async function resolvePriceRecord(
  fetcher: AllPricesFetcher,
  cardId: string,
  currentPrice: number,
  priorHigh: number | null,
  priorLow: number | null
): Promise<PriceRecordResult> {
  let high = priorHigh;
  let low = priorLow;
  if (high === null || low === null) {
    const allPrices = await fetcher.fetchAllPrices(cardId);
    if (allPrices.length > 0) {
      if (high === null) high = Math.max(...allPrices);
      if (low === null) low = Math.min(...allPrices);
    }
  }
  return computePriceRecord(currentPrice, high, low);
}
